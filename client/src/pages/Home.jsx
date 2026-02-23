import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  // Fetch projects
  const fetchProjects = () => {
    fetch("http://localhost:5000/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Create project
  const handleCreateProject = async (e) => {
    e.preventDefault();

    await fetch("http://localhost:5000/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_name: projectName,
        description: description,
      }),
    });

    setProjectName("");
    setDescription("");
    fetchProjects();
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Kanban Project Management</h1>

      <h2>Create Project</h2>

      <form onSubmit={handleCreateProject}>
        <input
          type="text"
          placeholder="Project Name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          required
        />
        <br />
        <br />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <br />
        <br />
        <button type="submit">Create Project</button>
      </form>

      <hr />

      <h2>Projects</h2>

      {projects.length === 0 ? (
        <p>No projects found</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li
              key={project.project_id}
              style={{ cursor: "pointer", marginBottom: "10px" }}
              onClick={() => navigate(`/project/${project.project_id}`)}
            >
              {project.project_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Home;
