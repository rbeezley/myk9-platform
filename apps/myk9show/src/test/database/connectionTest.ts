// Database connection and basic CRUD operation tests
import { checkDatabaseConnection } from '../../services/database/supabaseClient';
import { getAllClubs, getClubById } from '../../services/database/queries/clubQueries';
import { getAllDogs, getDogById } from '../../services/database/queries/dogQueries';
import { logger } from '@/services/LoggingService';

export const runDatabaseTests = async () => {
  logger.debug('🧪 Starting Database Connection Tests...\n', 'app', {});

  // Test 1: Database Connection
  logger.debug('1. Testing database connection...', 'app', {});
  try {
    const connectionResult = await checkDatabaseConnection();
    if (connectionResult.connected) {
      logger.debug(`✅ Database connected successfully (${connectionResult.latency}ms)`, 'app', {});
    } else {
      logger.debug(`❌ Database connection failed: ${connectionResult.error}`, 'app', {});
      return false;
    }
  } catch (error) {
    logger.debug(`❌ Database connection test failed: ${error}`, 'app', {});
    return false;
  }

  // Test 2: Clubs CRUD Operations
  logger.debug('\n2. Testing clubs queries...', 'app', {});
  try {
    const { data: clubs, error: clubsError } = await getAllClubs();
    if (clubsError) {
      logger.debug(`❌ Failed to get clubs: ${clubsError.message}`, 'app', {});
      return false;
    }
    logger.debug(`✅ Retrieved ${clubs.length} clubs`, 'app', {});

    if (clubs.length > 0) {
      const { data: club, error: clubError } = await getClubById(clubs[0].id);
      if (clubError) {
        logger.debug(`❌ Failed to get club by ID: ${clubError.message}`, 'app', {});
        return false;
      }
      logger.debug(`✅ Retrieved club details: ${club?.name}`, 'app', {});
    }
  } catch (error) {
    logger.debug(`❌ Clubs query test failed: ${error}`, 'app', {});
    return false;
  }

  // Test 3: Dogs CRUD Operations
  logger.debug('\n3. Testing dogs queries...', 'app', {});
  try {
    const { data: dogs, error: dogsError } = await getAllDogs('test-person-id');
    if (dogsError) {
      logger.debug(`❌ Failed to get dogs: ${dogsError.message}`, 'app', {});
      return false;
    }
    logger.debug(`✅ Retrieved ${dogs.length} dogs`, 'app', {});

    if (dogs.length > 0) {
      const { data: dog, error: dogError } = await getDogById(dogs[0].id);
      if (dogError) {
        logger.debug(`❌ Failed to get dog by ID: ${dogError.message}`, 'app', {});
        return false;
      }
      logger.debug(`✅ Retrieved dog details: ${dog?.name}`, 'app', {});
    }
  } catch (error) {
    logger.debug(`❌ Dogs query test failed: ${error}`, 'app', {});
    return false;
  }

  logger.debug('\n🎉 All database tests passed!', 'app', {});
  return true;
};

// Quick connection test for development
export const quickConnectionTest = async () => {
  const result = await checkDatabaseConnection();
  logger.debug('Database Connection:', 'test', {
    data: result.connected ? '✅ Connected' : '❌ Failed',
  });
  if (result.latency) {
    logger.debug('Latency:', 'test', { data: `${result.latency}ms` });
  }
  if (result.error) {
    logger.debug('Error:', 'test', { data: result.error });
  }
  return result.connected;
};
