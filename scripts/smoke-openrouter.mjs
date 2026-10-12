const key = process.env.OONR_API;
const model = 'anthropic/claude-haiku-5.5';
if (!key) {
  console.error('OONR_API GitHub Actions secret is missing');
  process.exit(1);
}

try {
  const signal = AbortSignal.timeout(45000);
  const headers = {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'};
  const catalog = await fetch('https://openrouter.ai/api/v1/models', {headers, signal});
  if (!catalog.ok) throw new Error('Catalog HTTP ' + catalog.status);
  const json = await catalog.json();
  if (!Array.isArray(json.data) || !json.data.some(m => m.id === model)) {
    throw new Error('Configured model not listed in the current OpenRouter catalog');
  }
  const start = performance.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST', headers, signal,
    body:JSON.stringify({model,max_tokens:32,messages:[{role:'user',content:'Answer: OK'}]})
  });
  if (!response.ok) throw new Error('Completion HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data.choices) || data.choices.length===0) throw new Error('Empty completion');
  console.log('OpenRouter live smoke OK: ' + model + ', elapsed ' + Math.round(performance.now()-start) + ' ms');
} catch (error) {
  console.error('OpenRouter live smoke failed: ' + error.message);
  process.exitCode = 1;
}
