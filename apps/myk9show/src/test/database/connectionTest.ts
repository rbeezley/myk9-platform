// Database connection and basic CRUD operation tests
import { checkDatabaseConnection } from '../../services/database/supabaseClient';
import { getAllClubs, getClubById } from '../../services/database/queries/clubQueries';
import { getAllDogs, getDogById } from '../../services/database/queries/dogQueries';

export const runDatabaseTests = async () => {
  console.log('🧪 Starting Database Connection Tests...\n');
  
  // Test 1: Database Connection
  console.log('1. Testing database connection...');
  try {
    const connectionResult = await checkDatabaseConnection();
    if (connectionResult.connected) {
      console.log(`✅ Database connected successfully (${connectionResult.latency}ms)`);
    } else {
      console.log(`❌ Database connection failed: ${connectionResult.error}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Database connection test failed: ${error}`);
    return false;
  }
  
  // Test 2: Clubs CRUD Operations
  console.log('\n2. Testing clubs queries...');
  try {
    const { data: clubs, error: clubsError } = await getAllClubs();
    if (clubsError) {
      console.log(`❌ Failed to get clubs: ${clubsError.message}`);
      return false;
    }
    console.log(`✅ Retrieved ${clubs.length} clubs`);
    
    if (clubs.length > 0) {
      const { data: club, error: clubError } = await getClubById(clubs[0].id);
      if (clubError) {
        console.log(`❌ Failed to get club by ID: ${clubError.message}`);
        return false;
      }
      console.log(`✅ Retrieved club details: ${club?.name}`);
    }
  } catch (error) {
    console.log(`❌ Clubs query test failed: ${error}`);
    return false;
  }
  
  // Test 3: Dogs CRUD Operations
  console.log('\n3. Testing dogs queries...');
  try {
    const { data: dogs, error: dogsError } = await getAllDogs();
    if (dogsError) {
      console.log(`❌ Failed to get dogs: ${dogsError.message}`);
      return false;
    }
    console.log(`✅ Retrieved ${dogs.length} dogs`);
    
    if (dogs.length > 0) {
      const { data: dog, error: dogError } = await getDogById(dogs[0].id);
      if (dogError) {
        console.log(`❌ Failed to get dog by ID: ${dogError.message}`);
        return false;
      }
      console.log(`✅ Retrieved dog details: ${dog?.name}`);
    }
  } catch (error) {
    console.log(`❌ Dogs query test failed: ${error}`);
    return false;
  }
  
  console.log('\n🎉 All database tests passed!');
  return true;
};

// Quick connection test for development
export const quickConnectionTest = async () => {
  const result = await checkDatabaseConnection();
  console.log('Database Connection:', result.connected ? '✅ Connected' : '❌ Failed');
  if (result.latency) {
    console.log('Latency:', `${result.latency}ms`);
  }
  if (result.error) {
    console.log('Error:', result.error);
  }
  return result.connected;
};