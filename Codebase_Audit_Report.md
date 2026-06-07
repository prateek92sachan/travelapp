# Codebase Audit Report: Findings, Fixes & Impact

## 📋 1. State Management (Cross-Store & DOM Events)
**The Issue:** `searchStore` directly mutates `mapStore` and dispatches global DOM events (`window.dispatchEvent`) to trigger UI changes.
* **How to fix:** Move those "side-effects" out of Zustand stores and into React components. A component (like `PlacesDrawer` or `MapboxMapInner`) will use a `useEffect` to watch the state. When `selectedPlaceId` changes, the component itself triggers the drawer to open or the map to pan natively in React.
* **UX Impact:** **None visually.** The flow remains exactly the same. However, it prevents rare, hard-to-reproduce bugs where a DOM event fires before a component is fully loaded on the screen, which could currently cause the map to fail to pan.

## 📋 2. Offline Persistence (Firebase)
**The Issue:** The Firebase initialization does not invoke offline persistence for Firestore.
* **How to fix:** We simply add a call to `enableIndexedDbPersistence(db)` when initializing Firebase in `src/services/firebase.js`.
* **UX Impact:** **Massive positive change.** If a customer is on a plane, subway, or in a remote travel area with no signal, they can still open the app and view their saved Plan/Wishlists seamlessly. Currently, without this, the app might show infinite spinners or blank screens when offline.

## 📋 3. Naive Cache Eviction
**The Issue:** The custom in-memory cache limits itself to 100 items by deleting the *oldest inserted* item (`Map.keys().next().value`), which is arbitrary.
* **How to fix:** Replace this naive eviction with an **LRU (Least Recently Used)** cache logic or migrate to `@tanstack/react-query`.
* **UX Impact:** **Smoother map panning.** If a user pans from Paris to London and back to Paris, the naive cache might have deleted Paris because it was inserted first. An LRU cache deletes the locations the user hasn't looked at in a while. This means much fewer loading spinners when panning back to places they recently viewed.

## 📋 4. Missing API Rate Limiting
**The Issue:** External calls to Google Maps, Gemini, and Weather lack exponential backoff and retry logic.
* **How to fix:** Wrap external API calls in an exponential backoff utility. If an API request fails because we sent too many, it waits 1 second and tries again, then 2 seconds, etc.
* **UX Impact:** **Fewer silent failures.** If your app gets a spike in traffic and hits an API limit, currently the UI will just stay blank or crash silently. With retries, the customer might experience a slight 1-2 second delay, but the app will eventually load the data instead of breaking.

## 📋 5. Vite Build Optimizations
**The Issue:** `vite.config.js` is missing manual chunking configurations and image compression plugins.
* **How to fix:** Update `vite.config.js` to split large third-party libraries (like Firebase, React, Mapbox) into separate "chunks" instead of one massive file, and add `vite-plugin-imagemin`.
* **UX Impact:** **Faster initial load.** The app will boot up noticeably faster on mobile devices on 3G/4G networks because the browser can download and cache these chunks much more efficiently.

## 📋 6. Monolithic Components
**The Issue:** `src/components/TabbedPlacesWidget.jsx` is severely monolithic, spanning over 1,100 lines and managing too many disparate states.
* **How to fix:** Split the 1,100-line file into 4 or 5 smaller files (e.g., `WishlistPanel.jsx`, `TabNavigation.jsx`, `PlaceRow.jsx`).
* **UX Impact:** **Snappier UI interactions.** Massive components suffer from over-rendering. If you type a single letter in a form, a 1,100-line component might redraw the entire screen, causing micro-stutters. Splitting it up ensures only the tiny piece of the UI that changed gets redrawn.

## 📋 7. Cumulative Layout Shifts (CLS)
**The Issue:** Hotel photos in `HotelInfoCard.jsx` do not have explicit dimensions, causing the layout to jump as images load.
* **How to fix:** Add explicit `aspect-ratio`, `width`, and `loading="lazy"` CSS to the `<img>` tags in `HotelInfoCard.jsx`.
* **UX Impact:** **Eliminates "jumping" UI.** Currently, when a hotel photo finally loads over the network, it pops into existence and pushes all the text and buttons below it downwards. This is jarring and can cause customers to accidentally tap the wrong button. Defining dimensions upfront reserves the space so the layout remains rock-solid while images load.

## 📋 8. Silent Error States
**The Issue:** Failures in the Gemini API are caught and silently returned as `null` without notifying the user.
* **How to fix:** When the Gemini API fails, instead of returning `null`, we throw an error or return a specific error state. The UI then catches this and shows a Toast notification.
* **UX Impact:** **Better communication.** Instead of the customer wondering why a place description is blank, they'll see a polite message like *"Could not load description, tap to retry."*
