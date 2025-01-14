(async () => {
  injectBlinkingStyle();

  // Create the summary div immediately on page load
  if (!window.summaryDiv) {
    window.summaryDiv = createSummaryDiv();
    window.summaryDiv.querySelector("p").innerHTML = `<span class="thinkingBlink">Thinking...</span>`;
  }

  const links = document.querySelectorAll("a");
  const summaries = new Map();
  let completeContent = "";
  const fetchContentPromises = [];

  for (const link of links) {
    if (link.dataset.listenerAttached) continue;
    link.dataset.listenerAttached = "true";

    if (link.href.includes("google.co")) continue;
    if (link.href.includes("x.com")) continue;
    if (link.href.includes("twitter.com")) continue;
    if (link.href === "") continue;

    const fetchPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "fetchHtml", url: link.href }, async (response) => {
        if (response && response.html) {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.html, "text/html");
            Array.from(doc.querySelectorAll("script, style")).forEach((el) => el.remove());
            const base = doc.createElement("base");
            base.href = link.href;
            doc.head.appendChild(base);

            const article = new Readability(doc).parse();
            if (article) {
              const content = article.textContent.replace(/\s+/g, " ").trim().substring(0, 1000);
              completeContent += content + "\n\n";
            }
          } catch (err) {
            console.error("Error in content.js parsing:", err);
          }
        }
        resolve();
      });
    });
    fetchContentPromises.push(fetchPromise);

    link.addEventListener("mouseover", () => {
      if (summaries.has(link.href)) {
        displayTooltip(link, summaries.get(link.href));
        return;
      }
      const tooltip = createTooltip(link, `<span class="thinkingBlink">Thinking...</span>`);

      chrome.runtime.sendMessage({ action: "fetchHtml", url: link.href }, async (response) => {
        if (!response || !response.html) {
          updateTooltip(tooltip, "Error fetching summary.");
          return;
        }
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.html, "text/html");
          const base = doc.createElement("base");
          base.href = link.href;
          doc.head.appendChild(base);

          const article = new Readability(doc).parse();
          if (article) {
            const content = article.textContent.substring(0, 1000);
            const urlObj = new URL(window.location.href);
            const searchTerm = urlObj.searchParams.get("q") || "";
            const prompt = `Here is the query asked by the user -- \n ${searchTerm} ---- \n and below is the content that is available to answer the query. \n --------- \n ${content} \n ------- \n  Please read the query carefully and answer using only the relevant content present. If there is no relevant content present, then do not answer anything.`;

            chrome.runtime.sendMessage({ action: "summarize", prompt }, (resp) => {
              summaries.set(link.href, resp.summary);
              updateTooltip(tooltip, resp.summary || "No summary available.");
            });
          } else {
            updateTooltip(tooltip, "Failed to extract content.");
          }
        } catch (err) {
          console.error("Error in content.js parsing:", err);
          updateTooltip(tooltip, "Error extracting summary.");
        }
      });
    });

    link.addEventListener("mouseout", () => {
      removeTooltip();
    });
  }

  await Promise.all(fetchContentPromises);

  chrome.runtime.sendMessage({
    action: "summarizeStream",
    prompt: `Summarize the following content:\n${completeContent}`,
  });
})();

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "streamChunk") {
    if (!window.summaryDiv) {
      window.summaryDiv = createSummaryDiv();
      window.summaryDiv.querySelector("p").innerHTML = `<span class="thinkingBlink">Thinking...</span>`;
    }
    const p = window.summaryDiv.querySelector("p");
    if (p.innerHTML.includes("thinkingBlink")) {
      p.innerHTML = "";
    }
    if (message.done) {
      p.innerHTML += "<br>";
    } else {
      p.innerHTML += convertMarkdownToHtml(message.response);
    }
  }
});

function createTooltip(link, text) {
  const tooltip = document.createElement("div");
  tooltip.classList.add("llama-tooltip");
  tooltip.style.position = "absolute";
  tooltip.style.background = "#333";
  tooltip.style.color = "#fff";
  tooltip.style.border = "1px solid #ccc";
  tooltip.style.borderRadius = "5px";
  tooltip.style.padding = "10px";
  tooltip.style.zIndex = 1000;
  tooltip.style.fontFamily = "Arial, sans-serif";
  tooltip.style.fontSize = "14px";
  tooltip.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
  tooltip.style.whiteSpace = "pre-wrap";
  tooltip.innerHTML = text;
  document.body.appendChild(tooltip);

  link.addEventListener("mousemove", positionTooltip);

  function positionTooltip(event) {
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.left = `${event.pageX + 10}px`;
  }

  return tooltip;
}

function updateTooltip(tooltip, text) {
  if (tooltip) {
    tooltip.innerHTML = text;
  }
}

function removeTooltip() {
  const tooltips = document.querySelectorAll("div.llama-tooltip");
  tooltips.forEach((tooltip) => {
    if (tooltip.parentNode === document.body) {
      tooltip.remove();
    }
  });
}

function displayTooltip(link, summary) {
  const tooltip = createTooltip(link, summary);
  link.addEventListener(
    "mousemove",
    (event) => {
      tooltip.style.top = `${event.pageY + 10}px`;
      tooltip.style.left = `${event.pageX + 10}px`;
    },
    { once: true }
  );
  link.addEventListener(
    "mouseout",
    () => {
      removeTooltip();
    },
    { once: true }
  );
}

function createSummaryDiv() {
  const summaryDiv = document.createElement("div");
  summaryDiv.style.position = "fixed";
  summaryDiv.style.right = "20px";
  summaryDiv.style.top = "20px";
  summaryDiv.style.width = "350px";
  summaryDiv.style.height = "400px";
  summaryDiv.style.background = "#ffffff";
  summaryDiv.style.border = "2px solid #007acc";
  summaryDiv.style.borderRadius = "10px";
  summaryDiv.style.padding = "15px";
  summaryDiv.style.overflowY = "auto";
  summaryDiv.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
  summaryDiv.style.zIndex = 10000;
  summaryDiv.style.fontFamily = "Arial, sans-serif";
  summaryDiv.style.fontSize = "16px";
  summaryDiv.style.color = "#333";
  summaryDiv.style.lineHeight = "1.6";

  const heading = document.createElement("h2");
  const url = new URL(window.location.href);
  const searchTerm = url.searchParams.get("q") || "Summary";
  heading.textContent = searchTerm;
  heading.style.marginTop = "0";
  heading.style.fontSize = "18px";
  heading.style.color = "#007acc";

  const toggleButton = document.createElement("button");
  toggleButton.innerText = "Hide";
  toggleButton.style.position = "absolute";
  toggleButton.style.top = "10px";
  toggleButton.style.right = "10px";
  toggleButton.style.border = "none";
  toggleButton.style.borderRadius = "5px";
  toggleButton.style.padding = "5px 10px";
  toggleButton.style.background = "#007acc";
  toggleButton.style.color = "#fff";
  toggleButton.style.fontFamily = "Arial, sans-serif";
  toggleButton.style.fontSize = "14px";
  toggleButton.style.cursor = "pointer";

  const showButton = document.createElement("button");
  showButton.innerText = "Show Summary";
  showButton.style.position = "fixed";
  showButton.style.right = "20px";
  showButton.style.top = "20px";
  showButton.style.zIndex = 10001;
  showButton.style.border = "none";
  showButton.style.borderRadius = "5px";
  showButton.style.padding = "5px 10px";
  showButton.style.background = "#007acc";
  showButton.style.color = "#fff";
  showButton.style.fontFamily = "Arial, sans-serif";
  showButton.style.fontSize = "14px";
  showButton.style.cursor = "pointer";
  showButton.style.display = "none";

  toggleButton.addEventListener("click", () => {
    summaryDiv.style.display = "none";
    toggleButton.style.display = "none";
    showButton.style.display = "block";
  });

  showButton.addEventListener("click", () => {
    summaryDiv.style.display = "block";
    toggleButton.style.display = "block";
    showButton.style.display = "none";
  });

  const contentP = document.createElement("p");
  contentP.innerHTML = "";

  summaryDiv.appendChild(heading);
  summaryDiv.appendChild(contentP);
  summaryDiv.appendChild(toggleButton);
  document.body.appendChild(showButton);
  document.body.appendChild(summaryDiv);

  return summaryDiv;
}

function updateSummaryDiv(summaryDiv, content) {
  summaryDiv.querySelector("p").innerHTML = content;
}

function convertMarkdownToHtml(markdown) {
  let html = markdown;
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/^#{1,6}\s(.+)$/gm, "<h3>$1</h3>");
  return html;
}

function injectBlinkingStyle() {
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes thinkingBlink {
      0% { opacity: 1; }
      50% { opacity: 0; }
      100% { opacity: 1; }
    }
    .thinkingBlink {
      animation: thinkingBlink 1s infinite;
    }

    .thinkingBlink {
      color: #007acc;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
}
