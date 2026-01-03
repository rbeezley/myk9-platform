const { createClient } = require('@supabase/supabase-js');
require('dotenv/config');

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
    // First, let's see what classes we actually have
    const { data: existingClasses, error: fetchError } = await supabase
      .from('tbl_class_queue')
      .select('id, element, class_status')
      .limit(10);
    
    if (fetchError) {
      console.error('❌ Error fetching existing classes:', fetchError);
      return;
    }

    console.log('📋 Existing classes:');
    existingClasses.forEach(cls => {
      console.log(`  ID ${cls.id}: ${cls.element || 'null'} (status: ${cls.class_status})`);
    });

    // Update the classes we found to have different elements and statuses
    if (existingClasses.length >= 4) {
      const updates = [
        { id: existingClasses[0].id, element: 'Container', class_status: 5 }, // in-progress
        { id: existingClasses[1].id, element: 'Buried', class_status: 5 },    // in-progress  
        { id: existingClasses[2].id, element: 'Interior', class_status: 2 },  // scheduled
        { id: existingClasses[3].id, element: 'Exterior', class_status: 1 }   // pending
      ];

      for (const update of updates) {
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
    }

    console.log('🎉 Multi-element scenario created successfully!');
    
    // Verify the updates
    const { data: updatedClasses, error: verifyError } = await supabase
      .from('tbl_class_queue')
      .select('id, element, class_status')
      .limit(10);
    
    if (verifyError) {
      console.error('❌ Error fetching updated classes:', verifyError);
      return;
    }

    console.log('📊 Final classes:');
    updatedClasses.forEach(cls => {
      const statusText = cls.class_status === 5 ? 'IN-PROGRESS' :
                        cls.class_status === 2 ? 'SCHEDULED' :
                        cls.class_status === 1 ? 'PENDING' : `STATUS-${cls.class_status}`;
      console.log(`  ${cls.id}: ${cls.element || 'null'} - ${statusText}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createMultipleElements();