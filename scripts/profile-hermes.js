const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

async function main() {
  const durationSec = parseInt(process.argv[2] || '12', 10);
  console.log(`[Profiler] Fetching Hermes debugger targets from Metro...`);
  
  const res = await fetch('http://localhost:8081/json/list');
  const targets = await res.json();
  const target = targets.find((t) => t.appId === 'com.opencode.expo') || targets[0];
  
  if (!target || !target.webSocketDebuggerUrl) {
    console.error('[Profiler] No target found on Metro. Is the app running?');
    process.exit(1);
  }

  console.log(`[Profiler] Target found: ${target.title} (${target.deviceName})`);
  console.log(`[Profiler] Connecting to ${target.webSocketDebuggerUrl}...`);

  const ws = new WebSocket(target.webSocketDebuggerUrl, {
    headers: { Origin: 'http://localhost:8081' },
  });

  let msgId = 1;
  const send = (method, params = {}) => {
    const id = msgId++;
    ws.send(JSON.stringify({ id, method, params }));
    return id;
  };

  ws.on('open', () => {
    console.log('[Profiler] Connected to Hermes debugger.');
    send('Profiler.enable');
    send('Profiler.start');
    console.log(`\n` + '#'.repeat(70));
    console.log(`>>> PROFILER IS RECORDING FOR ${durationSec} SECONDS <<<`);
    console.log(`>>> PLEASE PERFORM / DEMONSTRATE THE PRESS EVENT ON YOUR DEVICE NOW <<<`);
    console.log('#'.repeat(70) + `\n`);

    setTimeout(() => {
      console.log('[Profiler] Capture time elapsed. Stopping profiler and extracting CPU profile...');
      send('Profiler.stop');
    }, durationSec * 1000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.result && msg.result.profile) {
        const profile = msg.result.profile;
        const outputPath = path.join(process.cwd(), 'profile.cpuprofile');
        fs.writeFileSync(outputPath, JSON.stringify(profile, null, 2));
        console.log(`\n[Profiler] Saved profile to: ${outputPath}`);
        analyzeProfile(profile);
        ws.close();
        process.exit(0);
      }
    } catch (e) {
      console.error('[Profiler] Error processing message:', e);
    }
  });

  ws.on('error', (err) => {
    console.error('[Profiler] WebSocket error:', err);
  });
}

function analyzeProfile(profile) {
  const { nodes, samples, timeDeltas, startTime, endTime } = profile;
  const totalUs = timeDeltas ? timeDeltas.reduce((a, b) => a + b, 0) : (endTime - startTime);
  const totalMs = totalUs / 1000;

  console.log('\n' + '='.repeat(90));
  console.log(`  HERMES CPU FLAME CHART ANALYSIS (Duration: ${totalMs.toFixed(2)}ms, Samples: ${samples?.length || 0})`);
  console.log('='.repeat(90));

  const nodeMap = new Map();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const selfTimeMap = new Map();
  const totalTimeMap = new Map();

  if (samples && timeDeltas) {
    for (let i = 0; i < samples.length; i++) {
      const nodeId = samples[i];
      const deltaUs = timeDeltas[i] || 0;
      selfTimeMap.set(nodeId, (selfTimeMap.get(nodeId) || 0) + deltaUs);
    }
  }

  const formatFrame = (node) => {
    if (!node || !node.callFrame) return '(unknown)';
    const f = node.callFrame;
    const name = f.functionName || '(anonymous)';
    const rawUrl = f.url || '';
    const parts = rawUrl.split('/');
    const url = parts.slice(-2).join('/');
    const loc = url ? ` [${url}:${f.lineNumber || 0}:${f.columnNumber || 0}]` : '';
    return `${name}${loc}`;
  };

  const sortedSelf = Array.from(selfTimeMap.entries())
    .map(([id, us]) => ({ node: nodeMap.get(id), ms: us / 1000, pct: (us / totalUs) * 100 }))
    .filter((entry) => entry.ms > 0.05 && entry.node && entry.node.callFrame.functionName !== '(root)')
    .sort((a, b) => b.ms - a.ms);

  console.log('\nTop Functions by Self Execution Time (JS Thread Cost):');
  console.log('-'.repeat(90));
  sortedSelf.slice(0, 30).forEach((entry, idx) => {
    console.log(
      `#${(idx + 1).toString().padEnd(3)} ` +
      `${entry.ms.toFixed(2).padStart(8)}ms (${entry.pct.toFixed(1).padStart(4)}%)  ` +
      `${formatFrame(entry.node)}`
    );
  });

  console.log('\n' + '-'.repeat(90));
  console.log('Detected Long Frame Gaps / JS Blocked Intervals (>16.6ms):');
  console.log('-'.repeat(90));

  let stalls = 0;
  if (samples && timeDeltas) {
    for (let i = 0; i < samples.length; i++) {
      const deltaMs = (timeDeltas[i] || 0) / 1000;
      const nodeId = samples[i];
      const node = nodeMap.get(nodeId);

      if (deltaMs > 16.6) {
        stalls++;
        console.log(`[Dropped Frame #${stalls}] ${deltaMs.toFixed(2)}ms blocked at: ${formatFrame(node)}`);
      }
    }
  }

  if (stalls === 0) {
    console.log('No single-sample execution gaps > 16.6ms.');
  }

  console.log('='.repeat(90) + '\n');
}

main().catch(console.error);
