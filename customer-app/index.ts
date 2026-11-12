import { registerRootComponent } from 'expo';
import App from './App';
// Sets the notification handler at startup.
import './src/services/push';

registerRootComponent(App);
