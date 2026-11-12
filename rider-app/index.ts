import { registerRootComponent } from 'expo';
import App from './App';
// Registers the background location task and the notification handler at startup (must be top level).
import './src/services/backgroundLocation';
import './src/services/push';

registerRootComponent(App);
