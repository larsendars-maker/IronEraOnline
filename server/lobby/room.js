export class GameRoom {
  constructor(id, name, maxPlayers=20){
    this.id=id; this.name=name; this.maxPlayers=maxPlayers;
    this.status="waiting"; this.players=new Map(); this.createdAt=Date.now();
  }
}
