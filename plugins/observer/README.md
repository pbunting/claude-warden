# Observer

Inspired by [Six security outcomes for safely building, deploying and operating AI agents](https://agentbaseline.org/whitepaper.pdf). The first outcome is 'Discovery', 
> discover every agent and its dependencies.

This plugin attempts to collect runtime evidence of the skills/agents and tools used. 

## Installing

In Claude Code:

```
/plugin install observer --marketplace pbunting/claude-warden
```

## Development

Run validation from the repo root folder.

[Optional] To validate the marketplace as a whole:

```
claude plugin validate .
```

[Mandatory] To validate this plugin:

```
claude plugin validate ./plugins/observer
```
