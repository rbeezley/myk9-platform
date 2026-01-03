# Template System Integration

This directory contains the complete implementation of the Template System Integration for Phase 4.1 of the myK9Show database integration plan.

## Overview

The template system allows admins to create reusable templates for dog show classes and shows, with support for inheritance, customization, versioning, and usage tracking.

## Architecture

```
src/services/templates/
├── templateInheritance.ts      # Template inheritance and customization logic
├── templateVersioning.ts       # Version control and usage tracking
├── templateIntegrationExample.ts # Complete usage examples
└── README.md                   # This documentation

src/services/database/queries/
└── templateQueries.ts          # Database operations for templates

src/services/mappers/
└── templateMappers.ts          # Type conversions between stores and database

src/hooks/queries/
└── useTemplatesDatabase.ts     # React Query hooks for template operations
```

## Database Schema

The system uses three main tables:

### `class_template`
- Stores reusable class templates with metadata
- Fields: name, organization, show_type, description, fields (JSONB), class_pattern, etc.
- Supports soft deletion with `is_active` flag

### `show_template`
- Stores show-level templates with configuration
- Fields: name, organization, template_data (JSONB), usage tracking, etc.
- Includes usage analytics with `usage_count` and `last_used_at`

### `template_field`
- Stores individual field definitions for templates
- Foreign key relationship to class_template
- Supports field ordering, validation rules, and dependencies

## Core Features

### 1. Template CRUD Operations

```typescript
import { useTemplateManagement } from '@/hooks/queries/useTemplatesDatabase';

const {
  classTemplates,
  createClassTemplate,
  updateClassTemplate,
  deleteClassTemplate,
} = useTemplateManagement();
```

### 2. Template Inheritance

```typescript
import { createInheritedTemplate } from '@/services/templates/templateInheritance';

const childTemplate = createInheritedTemplate(parentTemplate, {
  parentId: parent.id,
  childOverrides: { name: 'Custom Template' },
  fieldOverrides: { level: { optional: false } },
  addedFields: [{ name: 'division', type: 'section', values: ['A', 'B'] }],
  removedFields: ['outdated_field'],
});
```

### 3. Template Versioning

```typescript
import { createTemplateVersion } from '@/services/templates/templateVersioning';

const version = createTemplateVersion(
  oldTemplate,
  newTemplate,
  'semantic', // version strategy
  'user-123', // created by
  'Added championship fields'
);
```

### 4. Usage Tracking

```typescript
import { trackTemplateUsage } from '@/services/templates/templateVersioning';

const usage = trackTemplateUsage(
  templateId,
  userId,
  'create_show',
  { showName: 'Spring Trial', location: 'Training Center' }
);
```

### 5. Class Generation

```typescript
import { generateClassesFromTemplate } from '@/services/mappers/templateMappers';

const classes = generateClassesFromTemplate(template);
// Generates all possible class combinations from template fields
```

## Query Patterns

### Fetching Templates

```typescript
// Get all class templates
const { data: templates } = useClassTemplatesQuery();

// Get templates by organization
const { data: akcTemplates } = useClassTemplatesByOrganizationQuery('AKC');

// Get specific template with fields
const { data: template } = useClassTemplateQuery(templateId);

// Search templates
const { data: results } = useClassTemplatesSearchQuery('scent work');
```

### Creating Templates

```typescript
const createMutation = useCreateClassTemplateMutation();

const newTemplate = await createMutation.mutateAsync({
  name: 'Custom Template',
  organization: 'AKC',
  show_type: 'Scent Work',
  class_pattern: '{element} {level} {section}',
  // ... other fields
});
```

### Template Fields Management

```typescript
// Get fields for a template
const { data: fields } = useTemplateFieldsQuery(templateId);

// Create multiple fields
const createFieldsMutation = useCreateTemplateFieldsMutation();
await createFieldsMutation.mutateAsync([
  {
    template_id: templateId,
    field_name: 'element',
    field_type: 'element',
    field_values: { options: ['Interior', 'Exterior'] },
    is_required: true,
    field_order: 0,
  },
  // ... more fields
]);
```

## Caching Strategy

The template system uses React Query with optimized caching:

- **Static Cache (30 min)**: Templates and template fields (rarely change)
- **Moderate Cache (5 min)**: Template statistics and usage data
- **Dynamic Cache (1 min)**: Search results and trending templates

### Cache Keys

```typescript
queryKeys.classTemplates              // All class templates
queryKeys.classTemplate(id)           // Specific template
queryKeys.classTemplatesByOrganization(org) // Org-specific templates
queryKeys.templateFields(templateId)  // Template fields
queryKeys.templateStatistics          // Usage statistics
queryKeys.templateSearch(term)        // Search results
```

## Error Handling

The system implements comprehensive error handling:

1. **Database Errors**: Wrapped with `createDatabaseError()` for consistent error format
2. **Validation Errors**: Template structure validation before save/update
3. **Inheritance Errors**: Validation of parent-child template compatibility
4. **Optimistic Updates**: Automatic rollback on mutation failures

## Performance Optimizations

1. **Batch Operations**: Support for creating multiple template fields at once
2. **Optimistic Updates**: Immediate UI updates with rollback on error
3. **Intelligent Prefetching**: Related data prefetching based on usage patterns
4. **Request Deduplication**: Automatic deduplication of identical requests
5. **Usage Tracking**: Async usage tracking to avoid blocking UI operations

## Usage Examples

See `templateIntegrationExample.ts` for complete usage examples including:

1. Creating new templates
2. Template inheritance and customization
3. Version management
4. Usage analytics
5. Class generation
6. Complete workflow from template selection to class creation

## Integration with Existing Stores

The template system maintains backward compatibility with existing Zustand stores:

```typescript
// Template stores remain functional
import { useTemplateStore } from '@/store/templateStore';
import { useClassTemplateStore } from '@/store/classTemplateStore';

// New database hooks provide enhanced functionality
import { useTemplateManagement } from '@/hooks/queries/useTemplatesDatabase';
```

## Security Considerations

1. **Soft Deletion**: Templates are soft-deleted to maintain referential integrity
2. **User Context**: All operations include user context for audit trails
3. **Validation**: Comprehensive validation before database operations
4. **Access Control**: Ready for RBAC integration (admin/secretary/viewer roles)

## Future Enhancements

The template system is designed to support future enhancements:

1. **Real-time Collaboration**: Template editing with multiple users
2. **Template Marketplace**: Sharing templates between organizations
3. **Advanced Analytics**: Machine learning for template recommendations
4. **Import/Export**: CSV/JSON template import/export functionality
5. **Template Categories**: Hierarchical template organization
6. **Approval Workflows**: Template review and approval processes

## Testing

The system includes comprehensive testing strategies:

1. **Unit Tests**: Individual function testing with mock data
2. **Integration Tests**: Database operation testing
3. **React Query Tests**: Hook testing with mock providers
4. **Validation Tests**: Template structure and inheritance validation
5. **Performance Tests**: Large dataset handling and caching effectiveness

## Migration from Legacy System

For migrating from the existing template stores:

1. **Data Migration**: Use mappers to convert existing template data
2. **Gradual Adoption**: Components can use both old and new systems during transition
3. **Fallback Strategy**: Automatic fallback to store data if database is unavailable
4. **Validation**: Ensure data consistency between store and database

## Monitoring and Analytics

The system provides comprehensive monitoring:

1. **Usage Statistics**: Template usage tracking and analytics
2. **Performance Metrics**: Query performance and cache hit rates
3. **Error Tracking**: Comprehensive error logging with context
4. **User Behavior**: Template selection and customization patterns

This template system provides a robust, scalable foundation for managing dog show templates with support for complex inheritance, versioning, and analytics while maintaining backward compatibility with the existing codebase.