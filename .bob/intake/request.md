Can you convert it to vercel, and check the documentation to make sure everything works, and see if there are upgrades required. If you need to use better (and cheap models) in the GPT-5/5.x family, please do so too. I have added the OpenAI API key. Can you swap out the Elevenlabs STT into the OpenAI one (which is a good balance between cheap and accuracy).

Please make sure that you build for stability ad backup of the voice clips. Use indexDB if you need to. No data should be lost and we should be able to retry and get the actual transcription.

Please refactor and clean the whole thing and make sure it has working, safe and secure code.

I want you to scan and improve the UI first, and test all the features and make sure everything is made better and optimised. Make sure no horizontal spilling out of buttons etc. It has to be iPad responsive. One other feature is to check which mic is connected via bluetooth, and how we can click on it.

Maybe sure the SSR and stuff makes sense so the UI is fast and smooth, without compromising security.

Let me know if you need more API keys.

I will also need a very basic authentication on Google Firebase Auth. I will whitelist a list of teachers eventually, but can you whitelist @ri.edu.sg and not @students.ri.edu.sg. See if you can connect using Bob first. But this should be last. Please test that everything else works first.

Then run semgrep and sonarqube and make sure it is a good enough trial-prototype.
