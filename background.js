chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const url = sender.tab && new URL(sender.tab.url);
  if (!url || url.hostname !== "www.google.com" || url.pathname !== "/search") {
    return false;
  }

  if (message.action === "fetchHtml") {
    fetch(message.url)
      .then((res) => res.text())
      .then((html) => {
        sendResponse({ html });
      })
      .catch((err) => {
        console.error("Error fetching HTML:", err);
        sendResponse({ html: null });
      });
    return true;
  }

  if (message.action === "summarize") {
    fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt: message.prompt,
        stream: false,
      }),
    })
      .then((response) => response.text())
      .then((text) => {
        const data = JSON.parse(text);
        sendResponse({ summary: data.response });
      })
      .catch((error) => {
        console.error("Error in fetch:", error);
        sendResponse({ summary: "An error occurred while summarizing." });
      });
    return true;
  }

  if (message.action === "summarizeStream") {
    fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt: message.prompt,
        stream: true,
      }),
    })
      .then((response) => {
        if (!response.body) {
          sendResponse({});
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let partialData = "";

        function readChunk() {
          reader.read().then(({ done, value }) => {
            if (done) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "streamChunk",
                done: true
              });
              sendResponse({});
              return;
            }
            partialData += decoder.decode(value, { stream: true });
            const lines = partialData.split("\n");
            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              try {
                const jsonObj = JSON.parse(line);
                chrome.tabs.sendMessage(sender.tab.id, {
                  action: "streamChunk",
                  response: jsonObj.response || "",
                  done: jsonObj.done || false
                });
              } catch (e) {
                // Ignore malformed lines
              }
            }
            partialData = lines[lines.length - 1];
            readChunk();
          });
        }

        readChunk();
      })
      .catch((error) => {
        console.error("Error in stream fetch:", error);
        sendResponse({});
      });
    return true;
  }
});