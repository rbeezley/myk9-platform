// Simple script to check and understand our element data structure
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkElementStructure() {
  console.log('🔍 Checking current element structure...');
  
  try {
    // Check classes table structure
    const { data: classes, error: classError } = await supabase
      .from('tbl_class_queue')
      .select('id, element, class_status')
      .limit(10);
    
    if (classError) {
      console.error('❌ Error fetching classes:', classError);
      return;
    }

    console.log('📋 Classes in tbl_class_queue:');
    classes.forEach(cls => {
      const statusText = cls.class_status === 5 ? 'IN-PROGRESS' :
                        cls.class_status === 2 ? 'SCHEDULED' :
                        cls.class_status === 1 ? 'PENDING' : `STATUS-${cls.class_status}`;
      console.log(`  ID ${cls.id}: ${cls.element || 'null'} - ${statusText}`);
    });

    // Check view structure
    const { data: viewData, error: viewError } = await supabase
      .from('view_dashboard_live')
      .select('element, judge_name, id')
      .eq('mobile_app_lic_key', 'myK9Q1-d8609f3b-d3fd43aa-6323a604')
      .limit(5);
    
    if (viewError) {
      console.error('❌ Error fetching view data:', viewError);
      return;
    }

    console.log('\n📋 View data elements:');
    const uniqueElements = [...new Set(viewData.map(d => d.element))];
    console.log(`  Unique elements found: ${uniqueElements.join(', ')}`);
    
    viewData.forEach(item => {
      console.log(`  ID ${item.id}: ${item.element} - Judge: ${item.judge_name}`);
    });

    // Let's try to update some classes to have different elements
    console.log('\n🔧 Attempting to create multi-element scenario...');
    
    if (classes.length >= 4) {
      const updates = [
        { id: classes[0].id, element: 'Container', class_status: 5 },
        { id: classes[1].id, element: 'Buried', class_status: 5 },
        { id: classes[2].id, element: 'Interior', class_status: 2 },
        { id: classes[3].id, element: 'Exterior', class_status: 1 }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('tbl_class_queue')
          .update({ element: update.element, class_status: update.class_status })
          .eq('id', update.id);
        
        if (error) {
          console.error(`❌ Failed to update class ${update.id}:`, error);
        } else {
          console.log(`✅ Updated class ${update.id}: ${update.element} (status: ${update.class_status})`);
        }
      }

      console.log('🎉 Multi-element scenario created!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkElementStructure();