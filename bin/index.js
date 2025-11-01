#!/usr/bin/env node

const { program } = require('commander');

// Setting up the CLI tool with Commander.js
program
  .version('1.0.0')
  .description('A simple CLI tool')
  .option('-n, --name <type>', 'Your name')
  .action((options) => {
    console.log(`Hello, ${options.name || 'World'}!`);
  });

// Parsing user input
program.parse(process.argv);
