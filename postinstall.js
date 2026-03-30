try {
  const msg = [
    '',
    '  \x1b[1mnrepo\x1b[0m installed ✓',
    '',
    '  Get started:',
    '    nrepo login                        Log in to NeuralRepo',
    '',
    '  Then try:',
    '    nrepo push "Build a Siri shortcut"  Save an idea',
    '    nrepo search "siri"                 Find it later',
    '',
  ].join('\n');
  process.stderr.write(msg + '\n');
} catch {
  // Silent failure — postinstall must not break npm install
}
