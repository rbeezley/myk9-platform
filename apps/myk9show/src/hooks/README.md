# Custom Hooks

This directory contains reusable custom hooks for the application.

## Available Hooks

### useAuth

A comprehensive authentication hook that provides user authentication state and methods.

#### Features

- **Authentication State**: Tracks the current user's authentication state
- **Session Management**: Handles session persistence and state changes
- **Auth Methods**: Provides methods for common auth operations

#### Usage

```typescript
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { 
    user,          // Current user object or null
    loading,       // Boolean indicating if auth state is being checked
    signIn,        // (email: string, password: string) => Promise<void>
    signUp,        // (email: string, password: string) => Promise<void>
    signOut,       // () => Promise<void>
    resetPassword, // (email: string) => Promise<void>
    updatePassword, // (newPassword: string) => Promise<void>
    updateProfile  // (updates: { email?: string, password?: string, data?: any }) => Promise<void>
  } = useAuth();

  // Use the auth methods and state
}
```

#### Error Handling

The hook throws errors when operations fail. These should be caught and handled in the UI:

```typescript
try {
  await signIn(email, password);
} catch (error) {
  // Handle error (e.g., show error message to user)
  console.error('Authentication error:', error.message);
}
```

## Error Boundaries

The application uses React Error Boundaries to gracefully handle errors in the component tree. The `ErrorBoundary` component can be used to wrap components that might throw errors.

### Example

```tsx
import ErrorBoundary from '@/components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary 
      fallback={
        <div className="p-4 text-red-600">
          Something went wrong. Please try again later.
        </div>
      }
    >
      <MyComponent />
    </ErrorBoundary>
  );
}
```

## Authentication Flow

1. **Initial Load**: The app checks for an existing session
2. **Sign In**: User provides credentials
3. **Session Management**: The hook maintains the session state
4. **Sign Out**: User can sign out, clearing the session
5. **Password Reset**: Users can reset their password via email

## Best Practices

1. **Error Handling**: Always wrap auth operations in try/catch blocks
2. **Loading States**: Use the `loading` state to show loading indicators
3. **Protected Routes**: Use the `user` state to protect routes that require authentication
4. **Error Boundaries**: Wrap components that use auth with ErrorBoundary for better error handling
5. **Type Safety**: The hook is fully typed with TypeScript for better developer experience
