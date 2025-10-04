process.stdout.write(JSON.stringify({ type: 'notification', message: 'server ready' }) + '\n');

setInterval(() => {
  // Keep the process alive
}, 1000)