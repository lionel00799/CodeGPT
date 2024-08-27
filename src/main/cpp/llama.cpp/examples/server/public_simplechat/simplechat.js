// @ts-check
// A simple completions and chat/completions test related web front end logic
// by Humans for All

class Roles {
    static System = "system";
    static User = "user";
    static Assistant = "assistant";
}

class ApiEP {
    static Chat = "chat";
    static Completion = "completion";
}

let gUsageMsg = `
    <p class="role-system">Usage</p>
    <ul class="ul1">
    <li> Set system prompt above, to try control ai response charactersitic, if model supports same.</li>
        <ul class="ul2">
        <li> Completion mode normally wont have a system prompt.</li>
        </ul>
    <li> Enter your query to ai assistant below.</li>
        <ul class="ul2">
        <li> Completion mode doesnt insert user/role: prefix implicitly.</li>
        <li> Use shift+enter for inserting enter/newline.</li>
        </ul>
    <li> Default ContextWindow = [System, Last Query+Resp, Cur Query].</li>
        <ul class="ul2">
        <li> experiment iRecentUserMsgCnt, max_tokens, model ctxt window to expand</li>
        </ul>
    </ul>
`;

/** @typedef {{role: string, content: string}[]} ChatMessages */

class SimpleChat {

    constructor() {
        /**
         * Maintain in a form suitable for common LLM web service chat/completions' messages entry
         * @type {ChatMessages}
         */
        this.xchat = [];
        this.iLastSys = -1;
    }

    clear() {
        this.xchat = [];
        this.iLastSys = -1;
    }

    /**
     * Recent chat messages.
     * If iRecentUserMsgCnt < 0
     *   Then return the full chat history
     * Else
     *   Return chat messages from latest going back till the last/latest system prompt.
     *   While keeping track that the number of user queries/messages doesnt exceed iRecentUserMsgCnt.
     * @param {number} iRecentUserMsgCnt
     */
    recent_chat(iRecentUserMsgCnt) {
        if (iRecentUserMsgCnt < 0) {
            return this.xchat;
        }
        if (iRecentUserMsgCnt == 0) {
            console.warn("WARN:SimpleChat:SC:RecentChat:iRecentUsermsgCnt of 0 means no user message/query sent");
        }
        /** @type{ChatMessages} */
        let rchat = [];
        let sysMsg = this.get_system_latest();
        if (sysMsg.length != 0) {
            rchat.push({role: Roles.System, content: sysMsg});
        }
        let iUserCnt = 0;
        let iStart = this.xchat.length;
        for(let i=this.xchat.length-1; i > this.iLastSys; i--) {
            if (iUserCnt >= iRecentUserMsgCnt) {
                break;
            }
            let msg = this.xchat[i];
            if (msg.role == Roles.User) {
                iStart = i;
                iUserCnt += 1;
            }
        }
        for(let i = iStart; i < this.xchat.length; i++) {
            let msg = this.xchat[i];
            if (msg.role == Roles.System) {
                continue;
            }
            rchat.push({role: msg.role, content: msg.content});
        }
        return rchat;
    }

    /**
     * Add an entry into xchat
     * @param {string} role
     * @param {string|undefined|null} content
     */
    add(role, content) {
        if ((content == undefined) || (content == null) || (content == "")) {
            return false;
        }
        this.xchat.push( {role: role, content: content} );
        if (role == Roles.System) {
            this.iLastSys = this.xchat.length - 1;
        }
        return true;
    }

    /**
     * Show the contents in the specified div
     * @param {HTMLDivElement} div
     * @param {boolean} bClear
     */
    show(div, bClear=true) {
        if (bClear) {
            div.replaceChildren();
        }
        let last = undefined;
        for(const x of this.recent_chat(gMe.iRecentUserMsgCnt)) {
            let entry = document.createElement("p");
            entry.className = `role-${x.role}`;
            entry.innerText = `${x.role}: ${x.content}`;
            div.appendChild(entry);
            last = entry;
        }
        if (last !== undefined) {
            last.scrollIntoView(false);
        } else {
            if (bClear) {
                div.innerHTML = gUsageMsg;
                gMe.show_info(div);
            }
        }
    }

    /**
     * Add needed fields wrt json object to be sent wrt LLM web services completions endpoint.
     * The needed fields/options are picked from a global object.
     * Convert the json into string.
     * @param {Object} obj
     */
    request_jsonstr(obj) {
        for(let k in gMe.chatRequestOptions) {
            obj[k] = gMe.chatRequestOptions[k];
        }
        return JSON.stringify(obj);
    }

    /**
     * Return a string form of json object suitable for chat/completions
     */
    request_messages_jsonstr() {
        let req = {
            messages: this.recent_chat(gMe.iRecentUserMsgCnt),
        }
        return this.request_jsonstr(req);
    }

    /**
     * Return a string form of json object suitable for /completions
     * @param {boolean} bInsertStandardRolePrefix Insert "<THE_ROLE>: " as prefix wrt each role's message
     */
    request_prompt_jsonstr(bInsertStandardRolePrefix) {
        let prompt = "";
        let iCnt = 0;
        for(const chat of this.recent_chat(gMe.iRecentUserMsgCnt)) {
            iCnt += 1;
            if (iCnt > 1) {
                prompt += "\n";
            }
            if (bInsertStandardRolePrefix) {
                prompt += `${chat.role}: `;
            }
            prompt += `${chat.content}`;
        }
        let req = {
            prompt: prompt,
        }
        return this.request_jsonstr(req);
    }

    /**
     * Allow setting of system prompt, but only at begining.
     * @param {string} sysPrompt
     * @param {string} msgTag
     */
    add_system_begin(sysPrompt, msgTag) {
        if (this.xchat.length == 0) {
            if (sysPrompt.length > 0) {
                return this.add(Roles.System, sysPrompt);
            }
        } else {
            if (sysPrompt.length > 0) {
                if (this.xchat[0].role !== Roles.System) {
                    console.error(`ERRR:SimpleChat:SC:${msgTag}:You need to specify system prompt before any user query, ignoring...`);
                } else {
                    if (this.xchat[0].content !== sysPrompt) {
                        console.error(`ERRR:SimpleChat:SC:${msgTag}:You cant change system prompt, mid way through, ignoring...`);
                    }
                }
            }
        }
        return false;
    }

    /**
     * Allow setting of system prompt, at any time.
     * @param {string} sysPrompt
     * @param {string} msgTag
     */
    add_system_anytime(sysPrompt, msgTag) {
        if (sysPrompt.length <= 0) {
            return false;
        }

        if (this.iLastSys < 0) {
            return this.add(Roles.System, sysPrompt);
        }

        let lastSys = this.xchat[this.iLastSys].content;
        if (lastSys !== sysPrompt) {
            return this.add(Roles.System, sysPrompt);
        }
        return false;
    }

    /**
     * Retrieve the latest system prompt.
     */
    get_system_latest() {
        if (this.iLastSys == -1) {
            return "";
        }
        let sysPrompt = this.xchat[this.iLastSys].content;
        return sysPrompt;
    }

}


let gBaseURL = "http://127.0.0.1:8080";
let gChatURL = {
    'chat': `${gBaseURL}/chat/completions`,
    'completion': `${gBaseURL}/completions`,
}


/**
 * Set the class of the children, based on whether it is the idSelected or not.
 * @param {HTMLDivElement} elBase
 * @param {string} idSelected
 * @param {string} classSelected
 * @param {string} classUnSelected
 */
function el_children_config_class(elBase, idSelected, classSelected, classUnSelected="") {
    for(let child of elBase.children) {
        if (child.id == idSelected) {
            child.className = classSelected;
        } else {
            child.className = classUnSelected;
        }
    }
}

/**
 * Create button and set it up.
 * @param {string} id
 * @param {(this: HTMLButtonElement, ev: MouseEvent) => any} callback
 * @param {string | undefined} name
 * @param {string | undefined} innerText
 */
function el_create_button(id, callback, name=undefined, innerText=undefined) {
    if (!name) {
        name = id;
    }
    if (!innerText) {
        innerText = id;
    }
    let btn = document.createElement("button");
    btn.id = id;
    btn.name = name;
    btn.innerText = innerText;
    btn.addEventListener("click", callback);
    return btn;
}


class MultiChatUI {

    constructor() {
        /** @type {Object<string, SimpleChat>} */
        this.simpleChats = {};
        /** @type {string} */
        this.curChatId = "";

        // the ui elements
        this.elInSystem = /** @type{HTMLInputElement} */(document.getElementById("system-in"));
        this.elDivChat = /** @type{HTMLDivElement} */(document.getElementById("chat-div"));
        this.elBtnUser = /** @type{HTMLButtonElement} */(document.getElementById("user-btn"));
        this.elInUser = /** @type{HTMLInputElement} */(document.getElementById("user-in"));
        this.elSelectApiEP = /** @type{HTMLSelectElement} */(document.getElementById("api-ep"));
        this.elDivSessions = /** @type{HTMLDivElement} */(document.getElementById("sessions-div"));

        this.validate_element(this.elInSystem, "system-in");
        this.validate_element(this.elDivChat, "chat-div");
        this.validate_element(this.elInUser, "user-in");
        this.validate_element(this.elSelectApiEP, "api-ep");
        this.validate_element(this.elDivChat, "sessions-div");
    }

    /**
     * Check if the element got
     * @param {HTMLElement | null} el
     * @param {string} msgTag
     */
    validate_element(el, msgTag) {
        if (el == null) {
            throw Error(`ERRR:SimpleChat:MCUI:${msgTag} element missing in html...`);
        } else {
            console.debug(`INFO:SimpleChat:MCUI:${msgTag} Id[${el.id}] Name[${el["name"]}]`);
        }
    }

    /**
     * Reset user input ui.
     * * clear user input
     * * enable user input
     * * set focus to user input
     */
    ui_reset_userinput() {
        this.elInUser.value = "";
        this.elInUser.disabled = false;
        this.elInUser.focus();
    }

    /**
     * Setup the needed callbacks wrt UI, curChatId to defaultChatId and
     * optionally switch to specified defaultChatId.
     * @param {string} defaultChatId
     * @param {boolean} bSwitchSession
     */
    setup_ui(defaultChatId, bSwitchSession=false) {

        this.curChatId = defaultChatId;
        if (bSwitchSession) {
            this.handle_session_switch(this.curChatId);
        }

        this.elBtnUser.addEventListener("click", (ev)=>{
            if (this.elInUser.disabled) {
                return;
            }
            this.handle_user_submit(this.curChatId, this.elSelectApiEP.value).catch((/** @type{Error} */reason)=>{
                let msg = `ERRR:SimpleChat\nMCUI:HandleUserSubmit:${this.curChatId}\n${reason.name}:${reason.message}`;
                console.debug(msg.replace("\n", ":"));
                alert(msg);
                this.ui_reset_userinput();
            });
        });

        this.elInUser.addEventListener("keyup", (ev)=> {
            // allow user to insert enter into their message using shift+enter.
            // while just pressing enter key will lead to submitting.
            if ((ev.key === "Enter") && (!ev.shiftKey)) {
                let value = this.elInUser.value;
                this.elInUser.value = value.substring(0,value.length-1);
                this.elBtnUser.click();
                ev.preventDefault();
            }
        });

        this.elInSystem.addEventListener("keyup", (ev)=> {
            // allow user to insert enter into the system prompt using shift+enter.
            // while just pressing enter key will lead to setting the system prompt.
            if ((ev.key === "Enter") && (!ev.shiftKey)) {
                let chat = this.simpleChats[this.curChatId];
                chat.add_system_anytime(this.elInSystem.value, this.curChatId);
                chat.show(this.elDivChat);
                ev.preventDefault();
            }
        });

    }

    /**
     * Setup a new chat session and optionally switch to it.
     * @param {string} chatId
     * @param {boolean} bSwitchSession
     */
    new_chat_session(chatId, bSwitchSession=false) {
        this.simpleChats[chatId] = new SimpleChat();
        if (bSwitchSession) {
            this.handle_session_switch(chatId);
        }
    }

    /**
     * Try read json response early, if available.
     * @param {Response} resp
     */
    async read_json_early(resp) {
        if (!resp.body) {
            throw Error("ERRR:SimpleChat:MCUI:ReadJsonEarly:No body...");
        }
        let tdUtf8 = new TextDecoder("utf-8");
        let rr = resp.body.getReader();
        let gotBody = "";
        while(true) {
            let { value: cur,  done: done} = await rr.read();
            let curBody = tdUtf8.decode(cur);
            console.debug("DBUG:SC:PART:", curBody);
            gotBody += curBody;
            if (done) {
                break;
            }
        }
        return JSON.parse(gotBody);
    }

    /**
     * Handle user query submit request, wrt specified chat session.
     * @param {string} chatId
     * @param {string} apiEP
     */
    async handle_user_submit(chatId, apiEP) {

        let chat = this.simpleChats[chatId];

        // In completion mode, if configured, clear any previous chat history.
        // So if user wants to simulate a multi-chat based completion query,
        // they will have to enter the full thing, as a suitable multiline
        // user input/query.
        if ((apiEP == ApiEP.Completion) && (gMe.bCompletionFreshChatAlways)) {
            chat.clear();
        }

        chat.add_system_anytime(this.elInSystem.value, chatId);

        let content = this.elInUser.value;
        if (!chat.add(Roles.User, content)) {
            console.debug(`WARN:SimpleChat:MCUI:${chatId}:HandleUserSubmit:Ignoring empty user input...`);
            return;
        }
        chat.show(this.elDivChat);

        let theBody;
        let theUrl = gChatURL[apiEP]
        if (apiEP == ApiEP.Chat) {
            theBody = chat.request_messages_jsonstr();
        } else {
            theBody = chat.request_prompt_jsonstr(gMe.bCompletionInsertStandardRolePrefix);
        }

        this.elInUser.value = "working...";
        this.elInUser.disabled = true;
        console.debug(`DBUG:SimpleChat:MCUI:${chatId}:HandleUserSubmit:${theUrl}:ReqBody:${theBody}`);
        let resp = await fetch(theUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: theBody,
        });

        let respBody = await resp.json();
        //let respBody = await this.read_json_early(resp);
        console.debug(`DBUG:SimpleChat:MCUI:${chatId}:HandleUserSubmit:RespBody:${JSON.stringify(respBody)}`);
        let assistantMsg;
        if (apiEP == ApiEP.Chat) {
            assistantMsg = respBody["choices"][0]["message"]["content"];
        } else {
            try {
                assistantMsg = respBody["choices"][0]["text"];
            } catch {
                assistantMsg = respBody["content"];
            }
        }
        chat.add(Roles.Assistant, assistantMsg);
        if (chatId == this.curChatId) {
            chat.show(this.elDivChat);
        } else {
            console.debug(`DBUG:SimpleChat:MCUI:HandleUserSubmit:ChatId has changed:[${chatId}] [${this.curChatId}]`);
        }
        this.ui_reset_userinput();
    }

    /**
     * Show buttons for NewChat and available chat sessions, in the passed elDiv.
     * If elDiv is undefined/null, then use this.elDivSessions.
     * Take care of highlighting the selected chat-session's btn.
     * @param {HTMLDivElement | undefined} elDiv
     */
    show_sessions(elDiv=undefined) {
        if (!elDiv) {
            elDiv = this.elDivSessions;
        }
        elDiv.replaceChildren();
        // Btn for creating new chat session
        let btnNew = el_create_button("New CHAT", (ev)=> {
            if (this.elInUser.disabled) {
                console.error(`ERRR:SimpleChat:MCUI:NewChat:Current session [${this.curChatId}] awaiting response, ignoring request...`);
                alert("ERRR:SimpleChat\nMCUI:NewChat\nWait for response to pending query, before starting new chat session");
                return;
            }
            let chatId = `Chat${Object.keys(this.simpleChats).length}`;
            let chatIdGot = prompt("INFO:SimpleChat\nMCUI:NewChat\nEnter id for new chat session", chatId);
            if (!chatIdGot) {
                console.error("ERRR:SimpleChat:MCUI:NewChat:Skipping based on user request...");
                return;
            }
            this.new_chat_session(chatIdGot, true);
            this.create_session_btn(elDiv, chatIdGot);
            el_children_config_class(elDiv, chatIdGot, "session-selected", "");
        });
        elDiv.appendChild(btnNew);
        // Btns for existing chat sessions
        let chatIds = Object.keys(this.simpleChats);
        for(let cid of chatIds) {
            let btn = this.create_session_btn(elDiv, cid);
            if (cid == this.curChatId) {
                btn.className = "session-selected";
            }
        }
    }

    create_session_btn(elDiv, cid) {
        let btn = el_create_button(cid, (ev)=>{
            let target = /** @type{HTMLButtonElement} */(ev.target);
            console.debug(`DBUG:SimpleChat:MCUI:SessionClick:${target.id}`);
            if (this.elInUser.disabled) {
                console.error(`ERRR:SimpleChat:MCUI:SessionClick:${target.id}:Current session [${this.curChatId}] awaiting response, ignoring switch...`);
                alert("ERRR:SimpleChat\nMCUI:SessionClick\nWait for response to pending query, before switching");
                return;
            }
            this.handle_session_switch(target.id);
            el_children_config_class(elDiv, target.id, "session-selected", "");
        });
        elDiv.appendChild(btn);
        return btn;
    }

    /**
     * Switch ui to the specified chatId and set curChatId to same.
     * @param {string} chatId
     */
    async handle_session_switch(chatId) {
        let chat = this.simpleChats[chatId];
        if (chat == undefined) {
            console.error(`ERRR:SimpleChat:MCUI:HandleSessionSwitch:${chatId} missing...`);
            return;
        }
        this.elInSystem.value = chat.get_system_latest();
        this.elInUser.value = "";
        chat.show(this.elDivChat);
        this.elInUser.focus();
        this.curChatId = chatId;
        console.log(`INFO:SimpleChat:MCUI:HandleSessionSwitch:${chatId} entered...`);
    }

}


class Me {

    constructor() {
        this.defaultChatIds = [ "Default", "Other" ];
        this.multiChat = new MultiChatUI();
        this.bCompletionFreshChatAlways = true;
        this.bCompletionInsertStandardRolePrefix = false;
        this.iRecentUserMsgCnt = 2;
        // Add needed fields wrt json object to be sent wrt LLM web services completions endpoint.
        this.chatRequestOptions = {
            "temperature": 0.7,
            "max_tokens": 1024,
            "frequency_penalty": 1.2,
            "presence_penalty": 1.2,
            "n_predict": 1024
        };
    }

    /**
     * @param {HTMLDivElement} elDiv
     */
    show_info(elDiv) {

        var p = document.createElement("p");
        p.innerText = "Settings (devel-tools-console gMe)";
        p.className = "role-system";
        elDiv.appendChild(p);

        var p = document.createElement("p");
        p.innerText = `bCompletionFreshChatAlways:${this.bCompletionFreshChatAlways}`;
        elDiv.appendChild(p);

        p = document.createElement("p");
        p.innerText = `bCompletionInsertStandardRolePrefix:${this.bCompletionInsertStandardRolePrefix}`;
        elDiv.appendChild(p);

        p = document.createElement("p");
        p.innerText = `iRecentUserMsgCnt:${this.iRecentUserMsgCnt}`;
        elDiv.appendChild(p);

        p = document.createElement("p");
        p.innerText = `chatRequestOptions:${JSON.stringify(this.chatRequestOptions)}`;
        elDiv.appendChild(p);

    }

}


/** @type {Me} */
let gMe;

function startme() {
    console.log("INFO:SimpleChat:StartMe:Starting...");
    gMe = new Me();
    for (let cid of gMe.defaultChatIds) {
        gMe.multiChat.new_chat_session(cid);
    }
    gMe.multiChat.setup_ui(gMe.defaultChatIds[0], true);
    gMe.multiChat.show_sessions();
}

document.addEventListener("DOMContentLoaded", startme);
