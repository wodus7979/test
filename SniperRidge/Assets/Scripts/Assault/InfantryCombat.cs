using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    // Shared controller for both teams. Movement is performed by Unity's NavMeshAgent.
    public sealed class InfantryCombat:MonoBehaviour
    {
        public bool Ally,Post;
        public int SquadIndex;
        public Vector3 DefensePoint;
        public EnemySoldier Target { get; private set; }
        public bool TargetsPlayer { get; private set; }
        public Vector3 TargetPoint => Target!=null?Target.AimPoint:GameManager.Instance.Player.AimPoint;
        public Vector3 Direction { get; private set; }
        public Vector3 LookPoint { get; private set; }
        public float Speed { get; private set; }
        public float Crouch { get; private set; }
        public bool CanShoot { get; private set; }
        public int ShotsFired { get; private set; }
        public float FireOpportunity { get; private set; }
        public float Travelled { get; private set; }
        public void RecordShot(){ShotsFired++;}
        public void RecordOpportunity(float dt){if(CanShoot)FireOpportunity+=dt;}
        EnemySoldier owner;
        AssaultNavigation navigation;
        public enum Tactic { Holding, Advancing, Relocating, TakingCover, Hidden, Peeking, Flanking, Searching }
        public Tactic CurrentTactic { get; private set; }
        public int CoverMoves { get; private set; }
        public int FlankMoves { get; private set; }
        public int Repositions { get; private set; }
        Vector3 destination,lastPosition,coverPoint,peekPoint,lastKnownThreat;
        float nextSense,decisionAt,moveUntil,hideUntil,nextThreat,stalled,postCycle,lastSeen=-100f,exposed;
        bool moving,hasCover,goingToCover;
        int peekBursts;
        NavMeshPath tacticalPath;
        readonly Collider[] nearby=new Collider[64],occupants=new Collider[32];
        void Awake(){tacticalPath=new NavMeshPath();}
        void Start()
        {
            if(owner!=null)return;
            owner=GetComponent<EnemySoldier>();navigation=GetComponent<AssaultNavigation>();
            lastPosition=transform.position;decisionAt=Time.time+Random.Range(1.2f,2.5f);postCycle=Random.Range(0,5f);
            if(Ally)
            {
                var block=new MaterialPropertyBlock();
                foreach(var renderer in GetComponentsInChildren<Renderer>())
                {
                    if(renderer is SkinnedMeshRenderer)
                    {renderer.GetPropertyBlock(block);block.SetColor("_UniformColor",new Color(.10f,.46f,.50f));renderer.SetPropertyBlock(block);}
                    else if(renderer.name=="Torso" || renderer.name=="Helmet" || renderer.name=="Leg" || renderer.name.StartsWith("Arm"))
                    {renderer.GetPropertyBlock(block);block.SetColor("_Color",new Color(.1f,.46f,.50f));renderer.SetPropertyBlock(block);}
                }
                var marker=GameObject.CreatePrimitive(PrimitiveType.Sphere);marker.name="Friendly blue marker";
                marker.transform.SetParent(transform,false);marker.transform.localPosition=Vector3.up*2.15f;marker.transform.localScale=Vector3.one*.14f;
                marker.GetComponent<Collider>().enabled=false;Destroy(marker.GetComponent<Collider>());
                marker.GetComponent<Renderer>().sharedMaterial=Effects.Unlit(new Color(.1f,.8f,1f));
            }
        }
        public void Suppress()
        {
            if(owner==null)Start();
            if(owner.Boss!=null||Time.time<nextThreat)return;
            nextThreat=Time.time+1.8f;
            if(Post){hideUntil=Time.time+Random.Range(.9f,1.6f);return;}
            // Reuse the known shelter instead of changing destination on every near miss.
            if(hasCover && Vector3.Distance(transform.position,coverPoint)<7f && Sheltered(coverPoint,lastKnownThreat))
            {BeginMove(coverPoint,true);return;}
            if(!ChooseMove(true)){hideUntil=Time.time+.45f;decisionAt=Time.time+.6f;}
        }
        public void Tick(float dt)
        {
            if(owner==null)Start();
            var gm=GameManager.Instance;float now=Time.time;
            float travelled=Vector3.Distance(lastPosition,transform.position);Travelled+=travelled;lastPosition=transform.position;
            Direction=Vector3.zero;Speed=0;Crouch=0;CanShoot=false;
            if(now>=nextSense){nextSense=now+.3f;Acquire(gm);}
            bool targetAlive=TargetsPlayer || Target!=null&&!Target.IsDead;
            bool visible=targetAlive && Visible(TargetPoint,Target);
            if(visible){lastKnownThreat=TargetPoint;lastSeen=now;exposed+=dt;}else exposed=0;
            bool remembers=now-lastSeen<7f;
            LookPoint=visible?TargetPoint:remembers?lastKnownThreat:transform.position+transform.forward*5;
            if(owner.Boss!=null)
            {
                TargetsPlayer=true;Target=null;LookPoint=gm.Player.AimPoint;
                CanShoot=owner.Boss.Engaged&&Visible(LookPoint,null);
                if(owner.Boss.Engaged&&!owner.Boss.IsAttacking)
                {Direction=navigation.Direction(owner.Boss.MoveTarget);Speed=1.6f;}
                return;
            }
            if(Ally && Vector3.Distance(transform.position,gm.Player.transform.position)>28f)
            {
                Vector3 formation=gm.Player.transform.TransformPoint(new Vector3((SquadIndex-1.5f)*1.8f,0,-4f));
                Direction=navigation.Direction(formation);Speed=4.2f;CanShoot=visible;moving=false;hasCover=false;CurrentTactic=Tactic.Advancing;return;
            }
            if(Post)
            {
                // Fixed roof posts stay on their platform; vary the firing/duck cycle.
                bool hidden=now<hideUntil || (now+postCycle)%7f<1.3f;
                Crouch=hidden?1f:0f;CanShoot=!hidden&&visible;
                CurrentTactic=hidden?Tactic.Hidden:Tactic.Holding;return;
            }
            stalled=moving && travelled<dt*.12f?stalled+dt:0;
            if(moving)
            {
                var delta=destination-transform.position;delta.y=0;
                bool arrived=delta.magnitude<.7f;
                if(arrived || now>=moveUntil || stalled>1.4f)
                {
                    moving=false;stalled=0;exposed=0;
                    decisionAt=now+Random.Range(3.4f,4.8f);
                    if(arrived&&goingToCover){hideUntil=now+Random.Range(.75f,1.3f);CurrentTactic=Tactic.Hidden;}
                    else if(!arrived){hasCover=false;decisionAt=now+.3f;}
                    else if(hasCover)peekBursts++;
                }
            }
            if(now<hideUntil){Crouch=1f;CurrentTactic=Tactic.Hidden;return;}
            if(!moving&&hasCover&&goingToCover)
            {
                // A shelter is accepted only with a reachable firing position nearby.
                // Stand to shoot over low cover, or move around the edge of a tall wall.
                BeginMove(peekPoint,false);CurrentTactic=Tactic.Peeking;
            }
            if(moving)
            {
                Direction=navigation.Direction(destination);Speed=goingToCover?4.6f:3.3f;
                CanShoot=visible&&!goingToCover;
                if(!visible&&!remembers)LookPoint=transform.position+Direction*5;
                return;
            }
            float range=visible?Vector3.Distance(transform.position,TargetPoint):999f;
            float desired=DesiredRange;
            if(visible)
            {
                CanShoot=true;CurrentTactic=Tactic.Holding;
                if(now>=decisionAt || exposed>5.5f || (range<8f&&now>=nextThreat))
                {
                    bool danger=owner.Health<45f||range<8f;
                    if(hasCover&&peekBursts<2&&!danger && Vector3.Distance(transform.position,coverPoint)<7f && Sheltered(coverPoint,lastKnownThreat))
                        BeginMove(coverPoint,true);
                    else ChooseMove(danger);
                    decisionAt=now+Random.Range(3.4f,4.8f);
                }
                if(range<desired+14f)return;
            }
            if(!visible&&remembers&&now>=decisionAt)
            {
                // Search around the last visible location; never follow a hidden target's
                // current position through the building that just obscured it.
                ChooseMove(false);decisionAt=now+2f;
                if(moving)return;
            }
            Vector3 goal=Ally?gm.Player.transform.TransformPoint(new Vector3((SquadIndex-1.5f)*1.8f,0,-4f)):
                visible?TargetPoint:remembers?lastKnownThreat:DefensePoint;
            float stop=visible?desired:2.5f;
            if(Vector3.Distance(transform.position,goal)>stop)
            {
                Direction=navigation.Direction(goal);Speed=3.4f;CanShoot=visible;
                CurrentTactic=remembers&&!visible?Tactic.Searching:Tactic.Advancing;
                if(!visible)LookPoint=transform.position+Direction*5;
            }
        }
        float DesiredRange=>owner.Role==EnemyRole.Sniper?32f:owner.Role==EnemyRole.RocketTrooper?25f:17f;
        void BeginMove(Vector3 point,bool shelter)
        {
            destination=point;goingToCover=shelter;moving=true;stalled=0;exposed=0;
            moveUntil=Time.time+Mathf.Clamp(Vector3.Distance(transform.position,point)/2f+2f,3f,10f);
            CurrentTactic=shelter?Tactic.TakingCover:Tactic.Relocating;navigation.Repath();
        }
        void Acquire(GameManager gm)
        {
            Target=null;TargetsPlayer=false;float best=90f;
            if(!Ally)
            {
                best=Vector3.Distance(transform.position,gm.Player.AimPoint)+(Visible(gm.Player.AimPoint,null)?0:25);
                TargetsPlayer=true;
            }
            if(gm.Assault==null)return;
            foreach(var candidate in gm.Assault.Soldiers)
            {
                if(candidate==null||candidate.IsDead||candidate==owner||candidate.IsAlly==Ally)continue;
                float distance=Vector3.Distance(transform.position,candidate.AimPoint);
                if(Ally && distance>65f)continue;
                float score=distance+(Visible(candidate.AimPoint,candidate)?0:25);
                if(score>=best)continue;best=score;Target=candidate;TargetsPlayer=false;
            }
        }
        bool Visible(Vector3 point,EnemySoldier target)
        {
            if(!EnemyProjectile.WorldHit(owner.Head.position,point,owner,out var hit))return true;
            var box=hit.collider.GetComponent<EnemyHitbox>();return box!=null && box.Owner==target;
        }
        bool ClearAt(Vector3 point)
        {
            int count=Physics.OverlapCapsuleNonAlloc(point+Vector3.up*.55f,point+Vector3.up*2.0f,.40f,occupants,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
            if(count==occupants.Length)return false;
            for(int i=0;i<count;i++)if(!occupants[i].transform.IsChildOf(transform))return false;
            return true;
        }
        bool Reachable(Vector3 point,out Vector3 result)
        {
            result=point;
            if(!NavMesh.SamplePosition(point,out var hit,1.25f,NavMesh.AllAreas)||Mathf.Abs(hit.position.y-transform.position.y)>1.1f)return false;
            result=hit.position;
            return ClearAt(result)&&NavMesh.CalculatePath(transform.position,result,NavMesh.AllAreas,tacticalPath)&&tacticalPath.status==NavMeshPathStatus.PathComplete;
        }
        bool Sheltered(Vector3 point,Vector3 threat)
        {
            // Crouched head and torso must both be shielded by actual world geometry.
            foreach(float height in new[]{.8f,1.25f})
                if(!EnemyProjectile.WorldHit(point+Vector3.up*height,threat,owner,out var hit)||hit.collider.GetComponentInParent<EnemySoldier>()!=null)return false;
            return true;
        }
        bool CanFireAt(Vector3 point,Vector3 threat)
        {
            foreach(float height in new[]{1.85f,2.25f})
            {
                if(!EnemyProjectile.WorldHit(point+Vector3.up*height,threat,owner,out var hit))continue;
                var hitbox=hit.collider.GetComponent<EnemyHitbox>();
                if(hitbox==null||hitbox.Owner!=Target)return false;
            }
            return true;
        }
        bool FindPeek(Vector3 point,Vector3 threat,Vector3 lateral,out Vector3 peek)
        {
            peek=point;
            if(CanFireAt(point,threat))return true;
            for(int i=0;i<4;i++)
            {
                var p=point+lateral*(i%2==0?1:-1)*(i<2?1.5f:3f);
                if(Reachable(p,out var end)&&CanFireAt(end,threat)){peek=end;return true;}
            }
            return false;
        }
        bool Crowded(Vector3 point)
        {
            var assault=GameManager.Instance.Assault;if(assault==null)return false;
            foreach(var other in assault.Soldiers)
            {
                if(other==null||other==owner||other.IsDead||other.IsAlly!=Ally)continue;
                var combat=other.Combat;
                if(Vector3.Distance(point,other.transform.position)<2.2f ||
                    combat!=null&&combat.moving&&Vector3.Distance(point,combat.destination)<2.2f)return true;
            }
            return false;
        }
        bool ChooseMove(bool threatened)
        {
            if(navigation==null)return false;
            Vector3 threat=Time.time-lastSeen<7f?lastKnownThreat:LookPoint;
            if((threat-transform.position).sqrMagnitude<1)return false;
            Vector3 away=transform.position-threat;away.y=0;away.Normalize();
            Vector3 lateral=Vector3.Cross(Vector3.up,away);
            float best=float.PositiveInfinity;bool found=false,covered=false;Vector3 chosen=transform.position,chosenPeek=chosen;
            var candidates=new System.Collections.Generic.List<Vector3>(64);
            // Surface-based candidates give a much better chance of finding cover than
            // random points in an open road. Ignore the ground and giant terrain bounds.
            int count=Physics.OverlapSphereNonAlloc(transform.position,12f,nearby,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore);
            for(int i=0;i<count&&candidates.Count<32;i++)
            {
                var collider=nearby[i];var bounds=collider.bounds;
                if(collider is TerrainCollider||collider.GetComponentInParent<EnemySoldier>()!=null||bounds.size.y<.7f||bounds.size.x>35||bounds.size.z>35)continue;
                Vector3 centre=bounds.center;centre.y=transform.position.y;
                float depth=Mathf.Abs(away.x)*bounds.extents.x+Mathf.Abs(away.z)*bounds.extents.z;
                float width=Mathf.Abs(lateral.x)*bounds.extents.x+Mathf.Abs(lateral.z)*bounds.extents.z;
                Vector3 back=centre+away*(depth+.8f);
                candidates.Add(back);
                candidates.Add(back+lateral*Mathf.Min(width,3f));candidates.Add(back-lateral*Mathf.Min(width,3f));
            }
            float flankSign=SquadIndex%2==0?1:-1;
            bool flankOrder=!threatened&&owner.Role==EnemyRole.MachineGunner&&SquadIndex%2==0;
            for(int i=0;i<24;i++)
            {
                float angle=(i/24f)*Mathf.PI*2+postCycle;
                float radius=i%2==0?4f:8f;
                candidates.Add(transform.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*radius);
            }
            foreach(var p in candidates)
            {
                if(Vector3.Distance(p,transform.position)<1.5f||Vector3.Distance(p,transform.position)>14f||!Reachable(p,out var end)||Crowded(end))continue;
                bool cover=Sheltered(end,threat);Vector3 peek=end;
                bool canFire=cover?FindPeek(end,threat,lateral,out peek):CanFireAt(end,threat);
                if(!canFire)continue;
                float range=Vector3.Distance(end,threat);
                if(owner.Role==EnemyRole.RocketTrooper&&range<10f)continue;
                var movement=end-transform.position;
                float sideStep=Vector3.Dot(movement,lateral)*flankSign;
                float score=movement.magnitude*.3f+Mathf.Abs(range-DesiredRange)*.18f-
                    Mathf.Clamp(sideStep,-6,6)*(flankOrder?1.4f:.5f)+(cover?0:threatened?18:flankOrder?1.5f:6);
                if(threatened)score-=Mathf.Clamp(Vector3.Dot(movement,away),-5,5)*.35f;
                if(score>=best)continue;best=score;chosen=end;chosenPeek=peek;covered=cover;found=true;
            }
            if(!found){decisionAt=Time.time+1f;return false;}
            hasCover=covered;coverPoint=chosen;peekPoint=chosenPeek;peekBursts=0;
            BeginMove(chosen,covered);Repositions++;
            if(covered)CoverMoves++;
            if(flankOrder&&Vector3.Dot(chosen-transform.position,lateral)*flankSign>3f)
            {FlankMoves++;if(!covered)CurrentTactic=Tactic.Flanking;}
            return true;
        }
    }
}
