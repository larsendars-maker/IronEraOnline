export async function api(path, options={}) {
  const token = localStorage.getItem("ironEraToken");
  const headers = {"Content-Type":"application/json", ...(options.headers||{})};
  if(token) headers.Authorization = "Bearer " + token;
  return fetch(path, {...options, headers});
}
