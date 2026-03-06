const yearEl = document.getElementById("year");
const gridEl = document.getElementById("projects-grid");

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

function titleFromFileName(fileName) {
  const baseName = fileName.replace(/\.exe$/i, "");
  return baseName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown size";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

function renderProjects(projects) {
  if (!gridEl) {
    return;
  }

  if (!projects.length) {
    gridEl.innerHTML = `
      <article class="card project-card">
        <h3>No Executables Found</h3>
        <p>Add .exe files to your GitHub repo, commit/push, then refresh.</p>
      </article>
    `;
    return;
  }

  const cards = projects
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => {
      const displayName = titleFromFileName(project.name);
      const fileSize = formatBytes(project.size);
      return `
        <article class="card project-card">
          <h3>${displayName}</h3>
          <p>Windows desktop executable build.</p>
          <div class="project-meta">
            <span>${fileSize}</span>
            <span>Windows</span>
          </div>
          <a class="project-link" href="${project.downloadUrl}" download aria-label="Download ${displayName} executable">Download EXE</a>
        </article>
      `;
    })
    .join("");

  gridEl.innerHTML = cards;
}

async function fetchGitHubProjects() {
  if (!gridEl) {
    return [];
  }

  const owner = gridEl.dataset.githubOwner || "";
  const repo = gridEl.dataset.githubRepo || "";
  const branchFromConfig = gridEl.dataset.githubBranch || "";
  const projectsPath = gridEl.dataset.projectsPath || "projects";

  const placeholders = ["YOUR_GITHUB_USERNAME", "YOUR_REPO_NAME"];
  if (!owner || !repo || placeholders.includes(owner) || placeholders.includes(repo)) {
    return [];
  }

  const fetchRepoMeta = async () => {
    const metaUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await fetch(metaUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      throw new Error(`Unable to read repository (${response.status}).`);
    }
    return response.json();
  };

  const repoMeta = await fetchRepoMeta();
  if (repoMeta.private) {
    throw new Error("Repository is private. Make it public for automatic project loading.");
  }

  const branch = branchFromConfig || repoMeta.default_branch || "main";

  const listFromFolder = async () => {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${projectsPath}?ref=${encodeURIComponent(branch)}`;
    const response = await fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      return [];
    }
    const files = await response.json();
    if (!Array.isArray(files)) {
      return [];
    }
    return files
      .filter((item) => item && item.type === "file" && /\.exe$/i.test(item.name))
      .map((item) => ({
        name: item.name,
        size: item.size,
        downloadUrl: item.download_url || item.html_url,
      }));
  };

  const listFromWholeRepo = async () => {
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetch(treeUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const payload = await response.json();
    const tree = Array.isArray(payload.tree) ? payload.tree : [];
    return tree
      .filter((item) => item && item.type === "blob" && /\.exe$/i.test(item.path || ""))
      .map((item) => {
        const path = item.path;
        const name = path.split("/").pop();
        return {
          name,
          size: item.size,
          downloadUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
        };
      });
  };

  const folderProjects = await listFromFolder();
  if (folderProjects.length) {
    return folderProjects;
  }
  return listFromWholeRepo();
}

async function fallbackLocalProjects() {
  const names = ["TaskAutomator.exe", "CSVAnalyzer.exe", "ShortcutLauncher.exe"];
  const checks = await Promise.all(
    names.map(async (name) => {
      const url = `projects/${name}`;
      try {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok ? { name, size: NaN, downloadUrl: url } : null;
      } catch {
        return null;
      }
    })
  );
  return checks.filter(Boolean);
}

async function initProjects() {
  try {
    const githubProjects = await fetchGitHubProjects();
    if (githubProjects.length) {
      renderProjects(githubProjects);
      return;
    }
  } catch (error) {
    console.error(error);
    if (gridEl) {
      const message = error instanceof Error ? error.message : "GitHub loading failed.";
      gridEl.innerHTML = `
        <article class="card project-card">
          <h3>GitHub Load Error</h3>
          <p>${message}</p>
        </article>
      `;
      return;
    }
  }

  const fallback = await fallbackLocalProjects();
  renderProjects(fallback);
}

initProjects();
