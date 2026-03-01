document.addEventListener("DOMContentLoaded", () => {
  // ===== TOOLBOX: Native HTML5 Drag & Drop =====
  const draggables = document.querySelectorAll(".draggable-item");
  let draggedType = null;

  draggables.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedType = item.getAttribute("data-type");
      e.dataTransfer.setData("text/plain", draggedType);
      e.dataTransfer.effectAllowed = "copy";
      item.style.opacity = "0.5";
    });
    item.addEventListener("dragend", () => {
      item.style.opacity = "1";
      draggedType = null;
    });
  });

  // ===== CARD MANAGEMENT =====
  const workspace = document.getElementById("workspace");
  let cardCounter = 0;
  let highestZ = 10;

  // Mouse-based card dragging state
  let movingCard = null;
  let moveOffsetX = 0;
  let moveOffsetY = 0;

  const STORAGE_KEY = "tg_builder_cards";

  // ===== LOAD SAVED CARDS FROM SERVER OR FALLBACK =====
  async function loadCards() {
    try {
      const resp = await fetch("/api/cards");
      if (resp.ok) {
        const data = await resp.json();
        if (data.length > 0) {
          const defaultCard = document.getElementById("card-template-wrapper");
          if (defaultCard) defaultCard.remove();
          data.forEach((cardData) => createCardFromData(cardData));
          return;
        }
      }
    } catch (e) {
      // Server not available, try localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          const defaultCard = document.getElementById("card-template-wrapper");
          if (defaultCard) defaultCard.remove();
          data.forEach((cardData) => createCardFromData(cardData));
          return;
        } catch (e2) {
          /* fall through */
        }
      }
    }
    initDefaultCard();
  }
  loadCards();

  function initDefaultCard() {
    const firstCard = document.getElementById("card-template-wrapper");
    if (!firstCard) return;
    cardCounter = 1;
    const wsRect = workspace.getBoundingClientRect();
    firstCard.style.left = (wsRect.width - 380) / 2 + "px";
    firstCard.style.top = "40px";
    initCard(firstCard);
  }

  // Add new card button
  document.getElementById("add-card-btn").addEventListener("click", () => {
    // Position relative to visible area (viewport), not the full 10000px workspace
    const scrollContainer = workspace.parentElement;
    const viewX =
      scrollContainer.scrollLeft + scrollContainer.clientWidth / 2 - 190;
    const viewY = scrollContainer.scrollTop + 40 + cardCounter * 50;
    createCardFromData({
      name: "Message " + (cardCounter + 1),
      x: viewX,
      y: viewY,
      elements: [],
    });
  });

  // ===== INIT CARD =====
  function initCard(cardWrapper) {
    // Delete button
    cardWrapper
      .querySelector(".delete-card-btn")
      .addEventListener("click", () => {
        if (workspace.querySelectorAll(".card-wrapper").length > 1) {
          cardWrapper.remove();
        } else {
          alert("Card terakhir tidak bisa dihapus!");
        }
      });

    // ====== FREE-FORM DRAG (Figma-style) via card-meta bar ======
    const meta = cardWrapper.querySelector(".card-meta");
    meta.addEventListener("mousedown", (e) => {
      // Don't start drag when clicking delete or editing the title
      if (e.target.closest(".delete-card-btn")) return;
      if (e.target.closest(".card-title")) return;

      e.preventDefault();
      movingCard = cardWrapper;
      const cardRect = cardWrapper.getBoundingClientRect();
      moveOffsetX = e.clientX - cardRect.left;
      moveOffsetY = e.clientY - cardRect.top;

      // Bring card to front
      cardWrapper.style.zIndex = ++highestZ;
      cardWrapper.classList.add("dragging");
    });

    // Init dropzone for toolbox element drops
    initDropzone(cardWrapper.querySelector(".card-content-area"));
  }

  // ===== GLOBAL MOUSE HANDLERS for card dragging =====
  document.addEventListener("mousemove", (e) => {
    if (!movingCard) return;
    const rect = workspace.getBoundingClientRect();
    movingCard.style.left = e.clientX - rect.left - moveOffsetX + "px";
    movingCard.style.top = e.clientY - rect.top - moveOffsetY + "px";
  });

  document.addEventListener("mouseup", () => {
    if (movingCard) {
      movingCard.classList.remove("dragging");
      movingCard = null;
    }
    if (isPanning) {
      isPanning = false;
      workspace.style.cursor = "";
    }
  });

  // ===== CANVAS PANNING =====
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;
  const scrollContainer = workspace.parentElement; // .canvas-area

  workspace.addEventListener("mousedown", (e) => {
    // Only pan when clicking directly on canvas (not on a card)
    // Or when middle mouse button is used
    if (
      e.button === 1 ||
      (e.button === 0 &&
        (e.target === workspace || e.target.classList.contains("bg-pattern")))
    ) {
      if (e.button === 1) e.preventDefault();
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollLeft = scrollContainer.scrollLeft;
      panScrollTop = scrollContainer.scrollTop;
      workspace.style.cursor = "grabbing";
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    scrollContainer.scrollLeft = panScrollLeft - dx;
    scrollContainer.scrollTop = panScrollTop - dy;
  });

  // ===== DROPZONE (for toolbox items only) =====
  function initDropzone(dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      if (draggedType) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        dropzone.closest(".telegram-card").classList.add("drag-over");
      }
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.closest(".telegram-card").classList.remove("drag-over");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.closest(".telegram-card").classList.remove("drag-over");
      const type = e.dataTransfer.getData("text/plain");
      if (type) {
        const placeholder = dropzone.querySelector(".placeholder-msg");
        if (placeholder) placeholder.remove();
        addElementToCard(type, dropzone);
      }
    });
  }

  // ===== ELEMENT SPAWNING =====
  function addElementToCard(type, targetDropzone) {
    const wrapper = document.createElement("div");
    wrapper.className = "tg-element";

    const actions = document.createElement("div");
    actions.className = "element-actions";
    actions.innerHTML =
      '<button class="delete-btn" title="Remove"><i class="fas fa-trash"></i></button>';
    wrapper.appendChild(actions);

    actions.querySelector(".delete-btn").addEventListener("click", () => {
      wrapper.remove();
      if (targetDropzone.children.length === 0) {
        targetDropzone.innerHTML =
          '<div class="placeholder-msg">Drag elements here...</div>';
      }
    });

    if (type === "photo") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";

      const placeholder = document.createElement("div");
      placeholder.className = "tg-photo-placeholder";
      placeholder.innerHTML =
        '<i class="fas fa-camera fa-2x" style="margin-bottom:8px; color:#6b7280;"></i><span>Click to upload photo</span>';

      const img = document.createElement("img");
      img.className = "tg-photo";

      placeholder.addEventListener("click", () => input.click());
      img.addEventListener("click", () => input.click());

      input.addEventListener("change", (ev) => {
        const file = ev.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            img.src = re.target.result;
            img.style.display = "block";
            placeholder.style.display = "none";
          };
          reader.readAsDataURL(file);
        }
      });

      wrapper.appendChild(input);
      wrapper.appendChild(placeholder);
      wrapper.appendChild(img);
      wrapper.setAttribute("data-el-type", "photo");
      targetDropzone.insertBefore(wrapper, targetDropzone.firstChild);
    } else if (type === "text") {
      const textDiv = document.createElement("div");
      textDiv.className = "tg-text";
      textDiv.contentEditable = "true";
      textDiv.innerHTML = "";
      wrapper.appendChild(textDiv);
      wrapper.setAttribute("data-el-type", "text");
      targetDropzone.appendChild(wrapper);
    } else if (type.startsWith("button_")) {
      const btnSize = type.split("_")[1]; // "1", "2", or "4"

      // Check if card already has an inline keyboard
      const existingKb = targetDropzone.querySelector(".tg-inline-keyboard");
      if (existingKb) {
        // Add button to existing last row
        let row = existingKb.querySelector(".tg-btn-row:last-child");
        if (!row) {
          row = document.createElement("div");
          row.className = "tg-btn-row";
          existingKb.appendChild(row);
        }
        const btn = document.createElement("div");
        btn.className = "tg-inline-btn";
        btn.setAttribute("data-size", btnSize);
        btn.contentEditable = "true";
        btn.textContent = "Button";
        row.appendChild(btn);
        // Don't create new wrapper, reused existing
        wrapper.remove();
        return;
      }

      const btnContainer = document.createElement("div");
      btnContainer.className = "tg-inline-keyboard";

      // Add button action
      const addBtn = document.createElement("button");
      addBtn.innerHTML = '<i class="fas fa-plus"></i>';
      addBtn.title = "Add Button";
      actions.insertBefore(addBtn, actions.firstChild);

      // Add new row action
      const addRowBtn = document.createElement("button");
      addRowBtn.innerHTML = '<i class="fas fa-level-down-alt"></i>';
      addRowBtn.title = "New Row";
      actions.insertBefore(addRowBtn, actions.firstChild);

      addBtn.addEventListener("click", () => {
        let row = btnContainer.querySelector(".tg-btn-row:last-child");
        if (!row) {
          row = document.createElement("div");
          row.className = "tg-btn-row";
          btnContainer.appendChild(row);
        }
        const b = document.createElement("div");
        b.className = "tg-inline-btn";
        b.setAttribute("data-size", btnContainer.dataset.lastSize || "1");
        b.contentEditable = "true";
        b.textContent = "Button";
        row.appendChild(b);
      });

      addRowBtn.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "tg-btn-row";
        btnContainer.appendChild(row);
      });

      // Create initial row with 1 button
      const row = document.createElement("div");
      row.className = "tg-btn-row";
      const btn = document.createElement("div");
      btn.className = "tg-inline-btn";
      btn.setAttribute("data-size", btnSize);
      btn.contentEditable = "true";
      btn.textContent = "Button";
      row.appendChild(btn);
      btnContainer.appendChild(row);
      btnContainer.dataset.lastSize = btnSize;

      wrapper.appendChild(btnContainer);
      wrapper.setAttribute("data-el-type", "button");
      targetDropzone.appendChild(wrapper);
    } else if (type.startsWith("reply_")) {
      const btnSize = type.split("_")[1];

      // Check if card already has a reply keyboard
      const existingKb = targetDropzone.querySelector(".tg-reply-keyboard");
      if (existingKb) {
        let row = existingKb.querySelector(".tg-reply-row:last-child");
        if (!row) {
          row = document.createElement("div");
          row.className = "tg-reply-row";
          existingKb.appendChild(row);
        }
        const btn = document.createElement("div");
        btn.className = "tg-reply-btn";
        btn.setAttribute("data-size", btnSize);
        btn.contentEditable = "true";
        btn.textContent = "Button";
        row.appendChild(btn);
        wrapper.remove();
        return;
      }

      const kbContainer = document.createElement("div");
      kbContainer.className = "tg-reply-keyboard";

      // Add button action
      const addBtn = document.createElement("button");
      addBtn.innerHTML = '<i class="fas fa-plus"></i>';
      addBtn.title = "Add Button";
      actions.insertBefore(addBtn, actions.firstChild);

      // Add new row
      const addRowBtn = document.createElement("button");
      addRowBtn.innerHTML = '<i class="fas fa-level-down-alt"></i>';
      addRowBtn.title = "New Row";
      actions.insertBefore(addRowBtn, actions.firstChild);

      addBtn.addEventListener("click", () => {
        let row = kbContainer.querySelector(".tg-reply-row:last-child");
        if (!row) {
          row = document.createElement("div");
          row.className = "tg-reply-row";
          kbContainer.appendChild(row);
        }
        const b = document.createElement("div");
        b.className = "tg-reply-btn";
        b.setAttribute("data-size", kbContainer.dataset.lastSize || "1");
        b.contentEditable = "true";
        b.textContent = "Button";
        row.appendChild(b);
      });

      addRowBtn.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "tg-reply-row";
        kbContainer.appendChild(row);
      });

      // Create initial row with 1 button
      const row = document.createElement("div");
      row.className = "tg-reply-row";
      const btn = document.createElement("div");
      btn.className = "tg-reply-btn";
      btn.setAttribute("data-size", btnSize);
      btn.contentEditable = "true";
      btn.textContent = "Button";
      row.appendChild(btn);
      kbContainer.appendChild(row);
      kbContainer.dataset.lastSize = btnSize;

      wrapper.appendChild(kbContainer);
      wrapper.setAttribute("data-el-type", "reply_keyboard");
      targetDropzone.appendChild(wrapper);
    }
  }

  // Button size is controlled by per-button data-size CSS attribute

  // ===== SAVE ALL =====
  document.getElementById("btn-save").addEventListener("click", async () => {
    const cardsData = serializeCards();

    // Build payload: each card gets its JS code + state
    const cards = cardsData.map((cardData) => ({
      fileName: cardData.name.toLowerCase().replace(/\s+/g, "_") + ".js",
      code: generateJS(cardData),
      state: cardData,
    }));

    // Also save to localStorage as fallback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cardsData));

    try {
      const resp = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards }),
      });
      const result = await resp.json();
      if (result.ok) {
        showSaveSuccess(result.files);
      } else {
        alert("Save error: " + result.error);
      }
    } catch (e) {
      // Server not available, download files instead
      cardsData.forEach((cardData, i) => {
        const jsCode = generateJS(cardData);
        const fileName =
          cardData.name.toLowerCase().replace(/\s+/g, "_") + ".js";
        const blob = new Blob([jsCode], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        setTimeout(() => {
          a.click();
          URL.revokeObjectURL(url);
        }, i * 300);
      });
      showSaveSuccess();
    }
  });

  function showSaveSuccess(files) {
    const btn = document.getElementById("btn-save");
    const orig = btn.innerHTML;
    const label = files ? `Saved ${files.length} file(s)!` : "Saved!";
    btn.innerHTML = `<i class="fas fa-check"></i> ${label}`;
    btn.style.borderColor = "#22c55e";
    btn.style.color = "#22c55e";
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.borderColor = "";
      btn.style.color = "";
    }, 2000);
  }

  // ===== GENERATE JS CODE =====
  function generateJS(cardData) {
    const funcName = cardData.name
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^\w/, (c) => c.toUpperCase());

    const safeFuncName = "send" + funcName;

    let hasPhoto = false;
    let photoVar = "";
    let textParts = [];
    let inlineKeyboard = null;
    let replyKeyboard = null;

    cardData.elements.forEach((el) => {
      if (el.type === "photo" && el.src) {
        hasPhoto = true;
        // If it's a base64 data URL, note it
        if (el.src.startsWith("data:")) {
          photoVar =
            "  // TODO: Replace with actual photo file path or URL\n  const photo = 'photo.jpg';";
        } else {
          photoVar = `  const photo = '${el.src}';`;
        }
      } else if (el.type === "text") {
        // Convert HTML to telegram-compatible text
        let text = el.html || "";
        // Clean up div/br tags to newlines
        text = text.replace(/<div>/gi, "\n").replace(/<\/div>/gi, "");
        text = text.replace(/<br\s*\/?>/gi, "\n");
        // Keep telegram-supported tags
        text = text.replace(/<\/?span[^>]*>/gi, "");
        // Clean up extra whitespace
        text = text.replace(/\n{3,}/g, "\n\n").trim();
        if (text) textParts.push(text);
      } else if (el.type === "button" && el.rows) {
        inlineKeyboard = el.rows.map((row) =>
          row.map((btn) => ({
            text: btn.text,
            callback_data: btn.text
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "_")
              .replace(/_+/g, "_"),
          })),
        );
      } else if (el.type === "reply_keyboard" && el.rows) {
        replyKeyboard = el.rows.map((row) => row.map((btn) => btn.text));
      }
    });

    const messageText = textParts.join("\n\n");

    let lines = [];
    lines.push(`// ${cardData.name}.js — Generated by Telegram UI Builder`);
    lines.push(`// Generated at: ${new Date().toLocaleString()}\n`);
    lines.push(`async function ${safeFuncName}(bot, chatId) {`);

    if (messageText) {
      // Escape backticks in the text
      const safeText = messageText.replace(/`/g, "\\`").replace(/\$/g, "\\$");
      lines.push(`  const message = \`${safeText}\`;`);
      lines.push("");
    }

    if (photoVar) {
      lines.push(photoVar);
      lines.push("");
    }

    // Build reply_markup
    let replyMarkup = null;
    if (inlineKeyboard) {
      replyMarkup = `{\n      inline_keyboard: ${JSON.stringify(inlineKeyboard, null, 6).replace(/\n/g, "\n      ")}\n    }`;
    } else if (replyKeyboard) {
      const kbArray = replyKeyboard.map((row) => row.map((text) => ({ text })));
      replyMarkup = `{\n      keyboard: ${JSON.stringify(kbArray, null, 6).replace(/\n/g, "\n      ")},\n      resize_keyboard: true,\n      is_persistent: true\n    }`;
    }

    // Build the send call
    if (hasPhoto) {
      let opts = [];
      if (messageText) opts.push(`    caption: message`);
      opts.push(`    parse_mode: "HTML"`);
      if (replyMarkup) opts.push(`    reply_markup: ${replyMarkup}`);

      lines.push(`  await bot.sendPhoto(chatId, photo, {`);
      lines.push(opts.join(",\n"));
      lines.push(`  });`);
    } else {
      let opts = [];
      opts.push(`    parse_mode: "HTML"`);
      if (replyMarkup) opts.push(`    reply_markup: ${replyMarkup}`);

      lines.push(`  await bot.sendMessage(chatId, message, {`);
      lines.push(opts.join(",\n"));
      lines.push(`  });`);
    }

    lines.push(`}\n`);
    lines.push(`module.exports = { ${safeFuncName} };`);
    lines.push("");

    return lines.join("\n");
  }

  // ===== SERIALIZE & SAVE =====
  function serializeCards() {
    const cards = workspace.querySelectorAll(".card-wrapper");
    const data = [];
    cards.forEach((cw) => {
      const name = cw.querySelector(".card-title").innerText.trim();
      const x = parseFloat(cw.style.left) || 0;
      const y = parseFloat(cw.style.top) || 0;
      const elements = [];

      cw.querySelectorAll(".tg-element").forEach((el) => {
        const t = el.getAttribute("data-el-type");
        if (t === "text") {
          elements.push({
            type: "text",
            html: el.querySelector(".tg-text").innerHTML,
          });
        } else if (t === "photo") {
          const img = el.querySelector("img");
          elements.push({
            type: "photo",
            src: img && img.style.display === "block" ? img.src : null,
          });
        } else if (t === "button") {
          const rows = [];
          el.querySelectorAll(".tg-btn-row").forEach((row) => {
            const btns = [];
            row.querySelectorAll(".tg-inline-btn").forEach((b) => {
              btns.push({
                text: b.innerText,
                size: b.getAttribute("data-size") || "1",
              });
            });
            rows.push(btns);
          });
          elements.push({ type: "button", rows });
        } else if (t === "reply_keyboard") {
          const rows = [];
          el.querySelectorAll(".tg-reply-row").forEach((row) => {
            const btns = [];
            row.querySelectorAll(".tg-reply-btn").forEach((b) => {
              btns.push({
                text: b.innerText,
                size: b.getAttribute("data-size") || "1",
              });
            });
            rows.push(btns);
          });
          elements.push({ type: "reply_keyboard", rows });
        }
      });

      data.push({ name, x, y, elements });
    });
    return data;
  }

  function saveToStorage() {
    const data = serializeCards();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ===== CREATE CARD FROM DATA =====
  function createCardFromData(cardData) {
    cardCounter++;
    const ts = Date.now() + Math.random();
    const cw = document.createElement("div");
    cw.className = "card-wrapper";
    cw.id = "cw-" + ts;
    cw.style.left = (cardData.x || 0) + "px";
    cw.style.top = (cardData.y || 40) + "px";
    cw.style.zIndex = ++highestZ;

    cw.innerHTML = `
      <div class="card-meta">
        <div class="card-title" contenteditable="true" spellcheck="false">${cardData.name || "Message " + cardCounter}</div>
        <div class="card-actions">
          <button class="delete-card-btn" title="Delete Card"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="telegram-card" id="tc-${ts}">
        <div class="card-content-area dropzone" id="dz-${ts}">
          <div class="placeholder-msg">Drag elements here...</div>
        </div>
      </div>
    `;

    workspace.appendChild(cw);
    initCard(cw);

    const dropzone = cw.querySelector(".card-content-area");

    // Restore elements
    if (cardData.elements && cardData.elements.length > 0) {
      dropzone.querySelector(".placeholder-msg")?.remove();

      cardData.elements.forEach((elData) => {
        if (elData.type === "photo") {
          addElementToCard("photo", dropzone);
          if (elData.src) {
            const wrapper = dropzone.querySelector('[data-el-type="photo"]');
            if (wrapper) {
              const img = wrapper.querySelector("img");
              const ph = wrapper.querySelector(".tg-photo-placeholder");
              img.src = elData.src;
              img.style.display = "block";
              if (ph) ph.style.display = "none";
            }
          }
        } else if (elData.type === "text") {
          addElementToCard("text", dropzone);
          const wrapper = dropzone.querySelector(
            '[data-el-type="text"]:last-child',
          );
          if (wrapper) {
            wrapper.querySelector(".tg-text").innerHTML = elData.html || "";
          }
        } else if (elData.type === "button") {
          // Create first button to establish the element
          if (
            elData.rows &&
            elData.rows.length > 0 &&
            elData.rows[0].length > 0
          ) {
            const firstBtn = elData.rows[0][0];
            addElementToCard("button_" + (firstBtn.size || "1"), dropzone);
            // Now find the keyboard and rebuild all rows
            const kb = dropzone.querySelector(".tg-inline-keyboard");
            if (kb) {
              kb.innerHTML = "";
              elData.rows.forEach((rowData) => {
                const row = document.createElement("div");
                row.className = "tg-btn-row";
                rowData.forEach((btnData) => {
                  const btn = document.createElement("div");
                  btn.className = "tg-inline-btn";
                  btn.setAttribute("data-size", btnData.size || "1");
                  btn.contentEditable = "true";
                  btn.textContent = btnData.text;
                  row.appendChild(btn);
                });
                kb.appendChild(row);
              });
            }
          }
        } else if (elData.type === "reply_keyboard") {
          if (
            elData.rows &&
            elData.rows.length > 0 &&
            elData.rows[0].length > 0
          ) {
            const firstBtn = elData.rows[0][0];
            addElementToCard("reply_" + (firstBtn.size || "1"), dropzone);
            const kb = dropzone.querySelector(".tg-reply-keyboard");
            if (kb) {
              kb.innerHTML = "";
              elData.rows.forEach((rowData) => {
                const row = document.createElement("div");
                row.className = "tg-reply-row";
                rowData.forEach((btnData) => {
                  const btn = document.createElement("div");
                  btn.className = "tg-reply-btn";
                  btn.setAttribute("data-size", btnData.size || "1");
                  btn.contentEditable = "true";
                  btn.textContent = btnData.text;
                  row.appendChild(btn);
                });
                kb.appendChild(row);
              });
            }
          }
        }
      });
    }
  }

  // ===== FORMAT TOOLBAR =====
  const formatToolbar = document.getElementById("format-toolbar");

  // Show toolbar on text selection inside .tg-text
  document.addEventListener("mouseup", (e) => {
    // Small delay to let browser finalize selection
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        formatToolbar.classList.remove("visible");
        return;
      }

      // Check if selection is inside a .tg-text element
      const anchorEl = sel.anchorNode?.parentElement?.closest(".tg-text");
      if (!anchorEl) {
        formatToolbar.classList.remove("visible");
        return;
      }

      // Position toolbar above selection
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const tbWidth = 200; // approximate toolbar width
      formatToolbar.style.left =
        Math.max(10, rect.left + rect.width / 2 - tbWidth / 2) + "px";
      formatToolbar.style.top = rect.top - 44 + window.scrollY + "px";
      formatToolbar.classList.add("visible");
    }, 10);
  });

  // Hide toolbar when clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".format-toolbar")) {
      // Will be handled by mouseup after selection check
    }
  });

  // Format button clicks
  formatToolbar.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Prevent losing selection
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute("data-cmd");
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      if (cmd === "bold") {
        document.execCommand("bold", false, null);
      } else if (cmd === "italic") {
        document.execCommand("italic", false, null);
      } else if (cmd === "underline") {
        document.execCommand("underline", false, null);
      } else if (cmd === "strikethrough") {
        document.execCommand("strikeThrough", false, null);
      } else if (cmd === "code") {
        // Wrap selection in <code> tag
        const range = sel.getRangeAt(0);
        const selectedText = range.toString();

        // Check if already inside a <code>
        const parentCode = sel.anchorNode?.parentElement?.closest("code");
        if (parentCode) {
          // Unwrap: replace <code> with its text content
          const text = document.createTextNode(parentCode.textContent);
          parentCode.replaceWith(text);
        } else {
          const codeEl = document.createElement("code");
          range.surroundContents(codeEl);
        }
      } else if (cmd === "quote") {
        // Wrap selection in <blockquote>
        const range = sel.getRangeAt(0);
        const parentQuote =
          sel.anchorNode?.parentElement?.closest("blockquote");
        if (parentQuote) {
          // Unwrap blockquote
          const frag = document.createDocumentFragment();
          while (parentQuote.firstChild) {
            frag.appendChild(parentQuote.firstChild);
          }
          parentQuote.replaceWith(frag);
        } else {
          const quoteEl = document.createElement("blockquote");
          range.surroundContents(quoteEl);
        }
      }
    });
  });
});
