import { h, render } from 'preact';
import { App } from './App.js';
import './styles/index.css';

const root = document.getElementById('app-root');
if (root) {
  render(<App />, root);
}
