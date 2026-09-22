Remote task
Instructions:
	•	Follow the steps below and implement the task at hand. The steps are laid out as logical extensions and should be implemented in order.
	•	Your goal is to build a small product. You could easily spend enormous amount of time on each step of the task so make sure that you use your time wisely. At each step, identify the core problem solve it and move on.
	•	We want you to make tradeoffs between the look, capability and architecture of the app in order deliver best overall result
	•	You are free to use tools of your choice, please simulate how you’d actually solve the task in your job.
Goal:
We’re going to implement an agentic automation platform :).
	•	Step 1 The basics Implement a lightweight frontend for our automation platform. For start, we want to be able to send in single set of instructions to an agentic system and get a response back. We’d recommend using Claude Agent SDK (Anthropic API key was sent via 1password link), but you can choose another if you want.
	•	Step 2 Doing something useful Give the agent a prompt for a task to be completed: “Fetch the latest AI news from the web and save them into a CSV”. Make sure that the user can get a copy of the output file
	•	Step 3 Observable automation Add a view that will be suitable to observe the automation as it unfolds, step by step. Beware that automations are often based on processes that consist out of a many steps. At every point, we should be able to derive the key state of the automation.
	•	Step 4 Connecting your data Imagine a process where the agent has to read data from an upstream service or app. We want to enable the user “connecting” to their data. Choose an MCP server of your choice and let the agent run an automation with it. Make sure that it’s clear that the agent is using this connection and that the user can enable/disable using it.
	•	Step 5 Evaluating the job When the agent completes its task we want to evaluate whether it was successful or not. Implement an automatic evaluation feature based on a artifact of your choice
