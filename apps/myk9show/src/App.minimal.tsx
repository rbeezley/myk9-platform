import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomeMinimal from './pages/Home.minimal';

function AppMinimal() {
  return (
    <div className="min-h-screen bg-white text-black">
      <h1>App Minimal Test</h1>
      <Routes>
        <Route path="/" element={<HomeMinimal />} />
      </Routes>
    </div>
  );
}

export default AppMinimal;