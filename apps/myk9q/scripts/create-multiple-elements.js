import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createMultipleElements() {
  console.log('🎯 Creating realistic multi-element scenario...');
  
  try {
    // Update classes to represent different elements running simultaneously
    const classUpdates = [
      { id: 1, element: 'Container', class_status: 5 }, // in-progress
      { id: 2, element: 'Buried', class_status: 5 },    // in-progress  
      { id: 3, element: 'Interior', class_status: 2 },  // scheduled
      { id: 4, element: 'Exterior', class_status: 1 }   // pending
    ];

    for (const update of classUpdates) {
      const { error } = await supabase
        .from('tbl_class_queue')
        .update({ 
          element: update.element, 
          class_status: update.class_status 
        })
        .eq('id', update.id);
      
      if (error) {
        console.error(`❌ Error updating class ${update.id}:`, error);
      } else {
        console.log(`✅ Updated class ${update.id}: ${update.element} (status: ${update.class_status})`);
      }
    }

    console.log('🎉 Multi-element scenario created successfully!');
    
    // Verify the updates
    const { data: classes, error: fetchError } = await supabase
      .from('tbl_class_queue')
      .select('id, element, class_status')
      .limit(10);
    
    if (fetchError) {
      console.error('❌ Error fetching classes:', fetchError);
      return;
    }

    console.log('📊 Updated classes:');
    classes.forEach(cls => {
      const statusText = cls.class_status === 5 ? 'IN-PROGRESS' :
                        cls.class_status === 2 ? 'SCHEDULED' :
                        cls.class_status === 1 ? 'PENDING' : `STATUS-${cls.class_status}`;
      console.log(`  ${cls.id}: ${cls.element} - ${statusText}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createMultipleElements();