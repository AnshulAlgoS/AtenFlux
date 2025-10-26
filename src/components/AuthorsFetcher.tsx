"use client";

import React, { useState } from "react";
import axios from "axios";

interface Author {
  name: string;
  profileLink: string;
}

export default function AuthorsFetcher() {
  const [outlet, setOutlet] = useState<string>("");
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);

  // Logs
  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Fetch authors from backend
  const fetchAuthors = async () => {
    if (!outlet.trim()) {
      setError("Please enter a news outlet name");
      addLog("No outlet name entered");
      return;
    }

    setLoading(true);
    setError("");
    setAuthors([]);
    setLogs([]);

    addLog(`Sending outlet name: "${outlet}" to backend`);

    const urls = [
      "http://localhost:5003/scrape-authors",
      "https://aten-131r.onrender.com/scrape-authors"
    ];

    try {
      let res;
      for (const url of urls) {
        try {
          res = await axios.post(
            url,
            { outlet },
            { headers: { "Cache-Control": "no-cache" }, timeout: 60000 }
          );
          addLog(`Successfully fetched from ${url}`);
          break; // stop after first successful fetch
        } catch (err: any) {
          addLog(`⚠️ Failed to fetch from ${url}: ${err.message}`);
          // Deployment check: if first URL fails and second is Render, show alert
          if (url.includes("aten-a6od.onrender.com")) {
            setError(
              "⚠️ Backend deployment seems to be down. AtenRise recommends cloning the repo and running locally to fetch data."
            );
          }
        }
      }

      if (!res) {
        if (!error) setError("All backend endpoints failed. Try running locally.");
        addLog("Failed to fetch authors from all endpoints");
        return;
      }

      const fetchedAuthors: Author[] = res.data.authors || [];
      if (!fetchedAuthors.length) {
        setError("No authors found for this outlet");
        addLog("No authors returned from backend");
        return;
      }

      setAuthors(fetchedAuthors);
      addLog(`Fetched ${fetchedAuthors.length} authors`);

    } catch (err: any) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
        addLog(`Backend error: ${err.response.data.error}`);
      } else if (err.message) {
        setError(err.message);
        addLog(`Error message: ${err.message}`);
      } else {
        setError("Failed to fetch authors");
        addLog("Unknown fetch error");
      }
    } finally {
      setLoading(false);
      addLog("Fetching process finished");
    }
  };


  return (
    <div
      className="max-w-5xl mx-auto mt-16 p-8 rounded-xl shadow-xl font-sans
                 bg-card/80 backdrop-blur-md text-card-foreground
                 animate-fadeIn"
    >
      <h1 className="text-3xl font-bold text-primary font-mono mb-6">
        Fetch Authors
      </h1>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          placeholder="Enter news outlet name"
          value={outlet}
          onChange={(e) => setOutlet(e.target.value)}
          className="flex-1 px-4 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={fetchAuthors}
          disabled={loading}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary transition-colors disabled:opacity-50"
        >
          {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {error && (
        <p className="text-destructive mb-4 border border-destructive bg-destructive/20 rounded-md p-3">
          {error}
        </p>
      )}

      {authors.length > 0 && (
        <div className="overflow-x-auto rounded-lg shadow-md border border-border mb-6 bg-card/90 backdrop-blur-sm">
          <table className="w-full border-collapse table-auto">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 border border-border text-left font-mono">Name</th>
                <th className="px-4 py-2 border border-border text-left font-mono">Profile</th>
              </tr>
            </thead>
            <tbody className="bg-card text-card-foreground">
              {authors.map((author, idx) => (
                <tr key={idx} className="hover:bg-muted transition-colors">
                  <td className="px-4 py-2 border border-border">{author.name}</td>
                  <td className="px-4 py-2 border border-border">
                    <a
                      href={author.profileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      View Profile
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 border border-border rounded-md p-4 max-h-64 overflow-y-auto font-mono text-sm bg-card/80 backdrop-blur-sm text-card-foreground">
        <h2 className="font-semibold mb-2 text-primary">Live Logs:</h2>
        {logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={idx} className="whitespace-pre-wrap">
              {log}
            </div>
          ))
        ) : (
          <p>No logs yet.</p>
        )}
      </div>
    </div>
  );
}
