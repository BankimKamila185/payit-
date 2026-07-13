import app from './app';

const PORT = process.env.PORT || 3000;

if (!process.env.ML_ENGINE_URL) {
  console.warn('[startup] WARNING: ML_ENGINE_URL environment variable is not set. ML-based scoring is disabled (using local fallback rules).');
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
