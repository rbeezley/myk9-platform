#!/bin/bash

echo "🧹 Cleaning up hanging browser and git processes..."
echo

echo "Killing Chrome processes..."
pkill -f chrome || echo "No Chrome processes found"

echo "Killing Firefox processes..."
pkill -f firefox || echo "No Firefox processes found"

echo "Killing WebKit processes..."
pkill -f webkit || echo "No WebKit processes found"

echo "Killing Playwright processes..."
pkill -f playwright || echo "No Playwright processes found"

echo
echo "Checking git processes..."
git_count=$(pgrep -c git 2>/dev/null || echo "0")
if [ "$git_count" -gt 5 ]; then
    echo "Found $git_count git processes, cleaning up..."
    pkill -f git || echo "Git cleanup completed"
else
    echo "Git process count is normal ($git_count)"
fi

echo
echo "✅ Process cleanup completed!"
echo "You can now run your tests again."