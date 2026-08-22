export function websocketUrl(){
  return `${location.protocol==="https:"?"wss:":"ws:"}//${location.host}`;
}
