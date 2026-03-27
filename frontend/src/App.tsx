import { Board } from './components/Board';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary name="App">
      <Board />
    </ErrorBoundary>
  );
}

export default App;
