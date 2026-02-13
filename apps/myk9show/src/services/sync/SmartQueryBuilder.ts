import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';
import type { Database } from '@/types/supabase';

/** Valid Supabase table names derived from the Database schema */
type TableName = keyof Database['public']['Tables'];

export interface User {
  id: string;
  role: string;
  state?: string;
  email?: string;
}

export interface QueryConfig {
  scope: string;
  limit: number;
}

export interface QueryFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface BaseQuery {
  from: string;
  select: string;
  filters: QueryFilter[];
  limit: number;
  orderBy?: string;
}

export class SmartQueryBuilder {

  /**
   * Build a query for an entity based on sync scope and user context
   */
  buildQuery(entity: string, config: QueryConfig, user: User): BaseQuery {
    switch (entity) {
      case 'shows':
        return this.buildShowQuery(config, user);
      case 'dogs':
        return this.buildDogQuery(config, user);
      case 'people':
        return this.buildPersonQuery(config, user);
      case 'clubs':
        return this.buildClubQuery(config, user);
      case 'entries':
        return this.buildEntryQuery(config, user);
      default:
        return this.buildGenericQuery(entity, config);
    }
  }

  /**
   * Execute a BaseQuery against Supabase and return the resulting rows.
   * Translates the abstract query descriptor into actual Supabase PostgREST calls.
   */
  async executeQuery(query: BaseQuery): Promise<Record<string, unknown>[]> {
    if (query.limit === 0) {
      return [];
    }

    try {
      // Start building the Supabase query
      // Cast to TableName since buildQuery produces known table names
      let supabaseQuery = supabase
        .from(query.from as TableName)
        .select(query.select);

      // Apply filters — only use simple, single-table operators that PostgREST supports.
      // Filters referencing joined tables (e.g. "entries.userId") are skipped at the
      // PostgREST level and would need to be handled via RPC or views in the future.
      for (const filter of query.filters) {
        // Skip relationship-based filters (contain dots) — these cannot be
        // expressed as simple PostgREST filters on the base table.
        if (filter.field.includes('.')) {
          logger.debug(
            `Skipping relationship filter: ${filter.field} ${filter.operator}`,
            'sync',
            {}
          );
          continue;
        }

        switch (filter.operator) {
          case 'eq':
            supabaseQuery = supabaseQuery.eq(filter.field, filter.value as string);
            break;
          case 'neq':
            supabaseQuery = supabaseQuery.neq(filter.field, filter.value as string);
            break;
          case 'gt':
            supabaseQuery = supabaseQuery.gt(
              filter.field,
              filter.value instanceof Date ? filter.value.toISOString() : (filter.value as string)
            );
            break;
          case 'gte':
            supabaseQuery = supabaseQuery.gte(
              filter.field,
              filter.value instanceof Date ? filter.value.toISOString() : (filter.value as string)
            );
            break;
          case 'lt':
            supabaseQuery = supabaseQuery.lt(
              filter.field,
              filter.value instanceof Date ? filter.value.toISOString() : (filter.value as string)
            );
            break;
          case 'lte':
            supabaseQuery = supabaseQuery.lte(
              filter.field,
              filter.value instanceof Date ? filter.value.toISOString() : (filter.value as string)
            );
            break;
          case 'contains':
            supabaseQuery = supabaseQuery.contains(filter.field, filter.value as Record<string, unknown>);
            break;
          case 'in':
            supabaseQuery = supabaseQuery.in(filter.field, filter.value as string[]);
            break;
          default:
            logger.warn(`Unsupported filter operator: ${filter.operator}`, 'sync');
        }
      }

      // Apply ordering
      if (query.orderBy) {
        const parts = query.orderBy.split(',').map(p => p.trim());
        for (const part of parts) {
          const tokens = part.split(/\s+/);
          const column = tokens[0];
          const ascending = !(tokens[1]?.toUpperCase() === 'DESC');
          supabaseQuery = supabaseQuery.order(column, { ascending });
        }
      }

      // Apply limit
      supabaseQuery = supabaseQuery.limit(query.limit);

      const { data, error } = await supabaseQuery;

      if (error) {
        throw new Error(`Supabase query on '${query.from}' failed: ${error.message}`);
      }

      return (data ?? []) as Record<string, unknown>[];
    } catch (error) {
      logger.error(
        `Failed to execute query on '${query.from}':`,
        'sync',
        {},
        error as Error
      );
      throw error;
    }
  }

  /**
   * Build query for shows based on scope
   */
  private buildShowQuery(config: QueryConfig, user: User): BaseQuery {
    const baseQuery: BaseQuery = {
      from: 'shows',
      select: '*',
      filters: [],
      limit: config.limit
    };

    switch (config.scope) {
      case 'upcoming-nearby':
        // Shows in the next 30 days in user's state
        baseQuery.filters.push(
          { field: 'date', operator: 'gte', value: new Date() },
          { field: 'date', operator: 'lte', value: this.addDays(new Date(), 30) }
        );
        if (user.state) {
          baseQuery.filters.push({ field: 'state', operator: 'eq', value: user.state });
        }
        break;

      case 'upcoming-entered':
        // Shows where user has entries
        baseQuery.filters.push(
          { field: 'date', operator: 'gte', value: new Date() },
          { field: 'entries.userId', operator: 'eq', value: user.id }
        );
        break;

      case 'assigned':
        // Shows where user is assigned as judge
        baseQuery.filters.push(
          { field: 'judge_assignments', operator: 'contains', value: { judge_id: user.id } },
          { field: 'date', operator: 'gte', value: new Date() }
        );
        break;

      case 'managing':
        // Shows where user is secretary/admin
        baseQuery.filters.push(
          { field: 'secretary_id', operator: 'eq', value: user.id }
        );
        break;

      case 'upcoming':
      default:
        // Basic upcoming shows
        baseQuery.filters.push(
          { field: 'date', operator: 'gte', value: new Date() }
        );
        break;
    }

    return baseQuery;
  }

  /**
   * Build query for dogs based on scope
   */
  private buildDogQuery(config: QueryConfig, user: User): BaseQuery {
    const baseQuery: BaseQuery = {
      from: 'dogs',
      select: '*',
      filters: [],
      limit: config.limit
    };

    switch (config.scope) {
      case 'own':
        // User's own dogs
        baseQuery.filters.push(
          { field: 'owner_id', operator: 'eq', value: user.id }
        );
        break;

      case 'by-entry':
        // Dogs with entries in shows user is involved with
        baseQuery.filters.push(
          { field: 'entries.shows.judge_assignments', operator: 'contains', value: { judge_id: user.id } }
        );
        break;

      case 'by-assignment':
        // Dogs in classes assigned to judge
        baseQuery.filters.push(
          { field: 'entries.classes.judge_id', operator: 'eq', value: user.id }
        );
        break;

      case 'show-entered':
        // Dogs entered in shows user is managing
        baseQuery.filters.push(
          { field: 'entries.shows.secretary_id', operator: 'eq', value: user.id }
        );
        break;

      case 'search-cache':
        // Recently searched dogs (would come from local cache)
        baseQuery.filters.push(
          { field: 'updated_at', operator: 'gte', value: this.addDays(new Date(), -7) }
        );
        baseQuery.limit = Math.min(config.limit, 50); // Limit cache size
        break;

      case 'none':
      default:
        // No dogs to sync
        baseQuery.limit = 0;
        break;
    }

    return baseQuery;
  }

  /**
   * Build query for people based on scope
   */
  private buildPersonQuery(config: QueryConfig, user: User): BaseQuery {
    const baseQuery: BaseQuery = {
      from: 'people',
      select: '*',
      filters: [],
      limit: config.limit
    };

    switch (config.scope) {
      case 'own':
        // Just the user themselves
        baseQuery.filters.push(
          { field: 'id', operator: 'eq', value: user.id }
        );
        break;

      case 'show-participants':
        // Users with entries in shows user is managing
        baseQuery.filters.push(
          { field: 'dogs.entries.shows.secretary_id', operator: 'eq', value: user.id }
        );
        break;

      case 'search-cache':
        // Recently searched people
        baseQuery.filters.push(
          { field: 'updated_at', operator: 'gte', value: this.addDays(new Date(), -7) }
        );
        baseQuery.limit = Math.min(config.limit, 100);
        break;

      case 'none':
      default:
        baseQuery.limit = 0;
        break;
    }

    return baseQuery;
  }

  /**
   * Build query for clubs based on scope
   */
  private buildClubQuery(config: QueryConfig, user: User): BaseQuery {
    const baseQuery: BaseQuery = {
      from: 'clubs',
      select: '*',
      filters: [],
      limit: config.limit
    };

    switch (config.scope) {
      case 'member':
        // Clubs where user is a member
        baseQuery.filters.push(
          { field: 'members', operator: 'contains', value: { member_id: user.id } }
        );
        break;

      case 'nearby':
        // Clubs in user's state
        if (user.state) {
          baseQuery.filters.push(
            { field: 'state', operator: 'eq', value: user.state }
          );
        }
        break;

      case 'active':
        // Clubs with upcoming shows
        baseQuery.filters.push(
          { field: 'shows.date', operator: 'gte', value: new Date() }
        );
        break;

      default:
        // Basic club list
        break;
    }

    return baseQuery;
  }

  /**
   * Build query for entries based on scope
   */
  private buildEntryQuery(config: QueryConfig, user: User): BaseQuery {
    const baseQuery: BaseQuery = {
      from: 'entries',
      select: '*',
      filters: [],
      limit: config.limit
    };

    switch (config.scope) {
      case 'own-active':
        // User's entries in upcoming shows
        baseQuery.filters.push(
          { field: 'dogs.owner_id', operator: 'eq', value: user.id },
          { field: 'shows.date', operator: 'gte', value: new Date() }
        );
        break;

      case 'assigned-classes':
        // Entries in classes assigned to judge
        baseQuery.filters.push(
          { field: 'classes.judge_id', operator: 'eq', value: user.id }
        );
        break;

      case 'show-all':
        // All entries in shows user is managing
        baseQuery.filters.push(
          { field: 'shows.secretary_id', operator: 'eq', value: user.id }
        );
        break;

      case 'class-specific':
        // Entries in specific classes (would need class context)
        break;

      case 'none':
      default:
        baseQuery.limit = 0;
        break;
    }

    return baseQuery;
  }

  /**
   * Build generic query for unknown entity types
   */
  private buildGenericQuery(entity: string, config: QueryConfig): BaseQuery {
    return {
      from: entity,
      select: '*',
      filters: [],
      limit: config.limit
    };
  }

  /**
   * Build query with geographic scope
   */
  buildGeoQuery(entity: string, config: QueryConfig, geoScope: { radius: number; center: [number, number] }): BaseQuery {
    const baseQuery = this.buildQuery(entity, config, { id: 'system', role: 'geo' });
    
    // Add geographic filters (would need PostGIS or similar)
    baseQuery.filters.push({
      field: 'location',
      operator: 'within_distance',
      value: {
        center: geoScope.center,
        radius: geoScope.radius
      }
    });

    return baseQuery;
  }

  /**
   * Build query with time range
   */
  buildTimeRangeQuery(entity: string, config: QueryConfig, timeRange: { start: Date; end: Date }): BaseQuery {
    const baseQuery = this.buildQuery(entity, config, { id: 'system', role: 'time' });
    
    // Add time range filters
    baseQuery.filters.push(
      { field: 'created_at', operator: 'gte', value: timeRange.start },
      { field: 'created_at', operator: 'lte', value: timeRange.end }
    );

    return baseQuery;
  }

  /**
   * Optimize query for selective loading
   */
  optimizeQuery(query: BaseQuery, entityType: string): BaseQuery {
    const optimized = { ...query };

    // Select only essential fields for initial load
    switch (entityType) {
      case 'dogs':
        optimized.select = 'id, name, breed, owner_id, registration_number';
        break;
      case 'people':
        optimized.select = 'id, first_name, last_name, email, city, state';
        break;
      case 'shows':
        optimized.select = 'id, name, date, club_id, location, status';
        break;
      case 'clubs':
        optimized.select = 'id, name, city, state, contact_email';
        break;
      case 'entries':
        optimized.select = 'id, dog_id, show_id, class_id, status';
        break;
    }

    // Add ordering for consistent results
    optimized.orderBy = this.getDefaultOrdering(entityType);

    return optimized;
  }

  /**
   * Get default ordering for an entity type
   */
  private getDefaultOrdering(entityType: string): string {
    const orderFields: Record<string, string> = {
      dogs: 'name',
      people: 'last_name, first_name',
      shows: 'date DESC',
      clubs: 'name',
      entries: 'created_at DESC'
    };

    return orderFields[entityType] || 'created_at DESC';
  }

  /**
   * Helper: Add days to a date
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}