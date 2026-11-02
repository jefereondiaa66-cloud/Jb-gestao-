/// <reference types="vite/client" />
import type { Api300 } from '../../shared/ipc';

declare global {
  interface Window {
    /** Ponte segura exposta pelo preload (única forma de falar com o motor). */
    api300: Api300;
  }
}

export {};
