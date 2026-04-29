import React from 'react';
import { createRoot } from 'react-dom/client';
import NarratifPlayer from './components/NarratifPlayer';
// In Vite, appending ?raw returns the file as a string
import playerStyles from './index.css?raw';

class NarratifEmbed extends HTMLElement {
  connectedCallback() {
    // Attach an open shadow root to ensure complete CSS encapsulation
    const shadowRoot = this.attachShadow({ mode: 'open' });
    
    // Create a style element and inject the raw CSS string into the isolated scope
    const styleElement = document.createElement('style');
    styleElement.textContent = playerStyles;
    shadowRoot.appendChild(styleElement);
    
    // Create the mount point for the React application
    const mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);
    
    // Render the React application into the isolated mount point
    const root = createRoot(mountPoint);
    
    // Parse dataset attributes passed to the custom element to provide React props
    const articleId = this.getAttribute('data-article-id');
    
    root.render(<NarratifPlayer articleId={articleId} />);
  }
}

// Register the custom web component with the browser registry
if (!window.customElements.get('narratif-player')) {
  window.customElements.define('narratif-player', NarratifEmbed);
}
