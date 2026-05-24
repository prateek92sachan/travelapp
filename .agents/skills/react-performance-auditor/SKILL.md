---
name: react-performance-auditor
description: Audits React and Vite codebases for performance, optimization, and data flow best practices.
---

# React Performance Auditor

Use this skill when asked to audit a React/Vite codebase for performance, optimization, or data flow problems.

## 📋 Audit Checklist

### 1. State Management & Data Flow (Zustand/Context)
- **Cross-Store Dependencies:** Flag instances where one store directly reads/mutates another (e.g. `useMapStore.getState()` called inside `searchStore`). This creates brittle coupling and race conditions.
- **DOM Events in State:** Avoid dispatching global window events (e.g., `window.dispatchEvent`) directly from stores. State logic should remain pure, and side-effects should be handled by React (`useEffect`) observing state changes.

### 2. Backend & Service Integration (Firebase & APIs)
- **Payload Merging and Limits:** Check Firebase `setDoc({ merge: true })` calls. Large nested objects (like wishlists) should not be merged entirely on every minor update to avoid blowing past the 1MB Firestore document limit and increasing latency.
- **Offline Persistence:** Ensure Firestore's `enableIndexedDbPersistence` is invoked, particularly for apps expected to be used in low-connectivity environments.
- **Cache Eviction Strategies:** Check in-memory caches (e.g. Map/Set). Avoid naive eviction like `delete(keys().next().value)`. Enforce LRU caching or advocate for `@tanstack/react-query`.
- **API Rate Limiting:** Look for external API calls (Gemini, Maps) without throttling, debouncing, or exponential backoff.

### 3. Vite Build Optimizations
- **Chunking:** Verify manual chunking configurations in `vite.config.js` to separate vendor code.
- **Asset Optimization:** Flag missing asset optimization/compression plugins.

### 4. React Rendering
- **Monolithic Components:** Flag large components that manage too much disparate state, causing cascading re-renders.
- **Memoization:** Ensure `useMemo` and `useCallback` are used appropriately for expensive calculations or stable prop references, but not overused prematurely.
