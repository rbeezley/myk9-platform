#!/usr/bin/env node

/**
 * Rename user components after migration
 * This script renames People* components to User* components
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Renaming user component files and directories...');

const rootDir = path.join(__dirname, '..', 'src', 'components', 'users');

// File renames mapping
const fileRenames = [
  // Main files
  ['PeopleDetailsMain.tsx', 'UserDetailsMain.tsx'],
  ['PeopleListPage.tsx', 'UserListPage.tsx'],
  ['PeopleTable.tsx', 'UserTable.tsx'],
  ['PeopleEnhancedSidebar.tsx', 'UserEnhancedSidebar.tsx'],
  ['VirtualizedPeopleTable.tsx', 'VirtualizedUserTable.tsx'],
  
  // Enhanced directory files
  ['enhanced/PaginatedPeopleList.tsx', 'enhanced/PaginatedUserList.tsx'],
  ['enhanced/VirtualPeopleList.tsx', 'enhanced/VirtualUserList.tsx'],
];

// Directory renames
const dirRenames = [
  ['PeopleDetails', 'UserDetails'],
  ['PeopleDetails/PeopleSidebar', 'UserDetails/UserSidebar'],
];

// Function to rename files
function renameFiles() {
  fileRenames.forEach(([oldName, newName]) => {
    const oldPath = path.join(rootDir, oldName);
    const newPath = path.join(rootDir, newName);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`✅ Renamed: ${oldName} → ${newName}`);
    } else {
      console.log(`⚠️  File not found: ${oldName}`);
    }
  });
}

// Function to rename directories
function renameDirectories() {
  // Rename nested directory first
  const peopleSidebarOld = path.join(rootDir, 'PeopleDetails', 'PeopleSidebar');
  const peopleSidebarNew = path.join(rootDir, 'PeopleDetails', 'UserSidebar');
  
  if (fs.existsSync(peopleSidebarOld)) {
    fs.renameSync(peopleSidebarOld, peopleSidebarNew);
    console.log(`✅ Renamed directory: PeopleSidebar → UserSidebar`);
  }
  
  // Then rename parent directory
  const peopleDetailsOld = path.join(rootDir, 'PeopleDetails');
  const peopleDetailsNew = path.join(rootDir, 'UserDetails');
  
  if (fs.existsSync(peopleDetailsOld)) {
    fs.renameSync(peopleDetailsOld, peopleDetailsNew);
    console.log(`✅ Renamed directory: PeopleDetails → UserDetails`);
  }
}

// Function to rename individual files in UserDetails
function renameUserDetailFiles() {
  const userDetailsDir = path.join(rootDir, 'UserDetails');
  
  const detailFileRenames = [
    ['PeopleDetailsLayout.tsx', 'UserDetailsLayout.tsx'],
    ['PeopleDetailsTabs.tsx', 'UserDetailsTabs.tsx'],
    ['PeopleDetailsView.tsx', 'UserDetailsView.tsx'],
  ];
  
  detailFileRenames.forEach(([oldName, newName]) => {
    const oldPath = path.join(userDetailsDir, oldName);
    const newPath = path.join(userDetailsDir, newName);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`✅ Renamed: UserDetails/${oldName} → UserDetails/${newName}`);
    }
  });
  
  // Rename sidebar files
  const sidebarDir = path.join(userDetailsDir, 'UserSidebar');
  const sidebarRenames = [
    ['PeopleListItem.tsx', 'UserListItem.tsx'],
    ['PeopleSidebar.tsx', 'UserSidebar.tsx'],
    ['PeopleSidebarSearch.tsx', 'UserSidebarSearch.tsx'],
  ];
  
  sidebarRenames.forEach(([oldName, newName]) => {
    const oldPath = path.join(sidebarDir, oldName);
    const newPath = path.join(sidebarDir, newName);
    
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      console.log(`✅ Renamed: UserSidebar/${oldName} → UserSidebar/${newName}`);
    }
  });
}

// Execute renames
try {
  renameFiles();
  renameDirectories();
  renameUserDetailFiles();
  
  console.log('\n✅ All user component files and directories renamed successfully!');
  console.log('\n📝 Next steps:');
  console.log('1. Update import statements in the affected files');
  console.log('2. Run npm run build to check for remaining errors');
  
} catch (error) {
  console.error('❌ Error during renaming:', error.message);
  process.exit(1);
}