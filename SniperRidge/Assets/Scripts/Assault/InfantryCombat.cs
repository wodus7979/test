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
        Vector3 destination,anchor,lastPosition;
        float nextSense,decisionAt,moveUntil,hideUntil,nextThreat,stalled,postCycle;
        bool moving,hasCover;
        void Start()
        {
            if(owner!=null)return;
            owner=GetComponent<EnemySoldier>();navigation=GetComponent<AssaultNavigation>();
            anchor=lastPosition=transform.position;decisionAt=Time.time+Random.Range(2.5f,4f);postCycle=Random.Range(0,5f);
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
            if(owner!=null&&owner.Boss!=null)return;
            if(Time.time<nextThreat)return;nextThreat=Time.time+4f;
            if(Post){hideUntil=Time.time+1.4f;return;}
            if(owner!=null)ChooseMove(true);
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
            LookPoint=visible?TargetPoint:transform.position+transform.forward*5;
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
                Direction=navigation.Direction(formation);Speed=4.2f;CanShoot=visible;moving=false;return;
            }
            if(Post)
            {
                bool hidden=now<hideUntil || (now+postCycle)%6f<1.6f;
                Crouch=hidden?1f:0f;CanShoot=!hidden&&visible;return;
            }
            if(!Ally && !visible && Vector3.Distance(transform.position,gm.Player.transform.position)>38f)
            {
                moving=false;
                if(Vector3.Distance(transform.position,DefensePoint)>3f)
                {Direction=navigation.Direction(DefensePoint);Speed=2.6f;LookPoint=transform.position+Direction*5;}
                return;
            }
            stalled=moving && travelled<dt*.12f?stalled+dt:0;
            if(moving)
            {
                var delta=destination-transform.position;delta.y=0;
                if(delta.magnitude<.65f || now>=moveUntil || stalled>1.5f)
                {
                    moving=false;stalled=0;decisionAt=now+Random.Range(2.6f,4f);
                    if(hasCover && delta.magnitude<.65f)hideUntil=now+1.1f;
                }
            }
            if(now<hideUntil){Crouch=1f;return;}
            if(moving)
            {
                Direction=navigation.Direction(destination);Speed=hasCover?4.5f:3.5f;
                LookPoint=visible?TargetPoint:transform.position+Direction*5;
                CanShoot=visible&&!hasCover;return;
            }
            float range=targetAlive?Vector3.Distance(transform.position,TargetPoint):999f;
            float desired=owner.Role==EnemyRole.MachineGunner?16f:30f;
            if(visible && range<desired+12f)
            {
                CanShoot=true;Crouch=.25f;
                if(now>=decisionAt){ChooseMove(false);decisionAt=now+3f;}
                return;
            }
            Vector3 goal;
            if(Ally)
            {
                goal=gm.Player.transform.TransformPoint(new Vector3((SquadIndex-1.5f)*1.8f,0,-3f-(SquadIndex%2)*2));
                if(visible && range>desired && range<45f)goal=Target.transform.position;
            }
            else goal=targetAlive?TargetPoint:gm.Player.transform.position;
            if(Vector3.Distance(transform.position,goal)>2.5f)
            {
                Direction=navigation.Direction(goal);Speed=3.5f;CanShoot=visible;
                if(!visible)LookPoint=transform.position+Direction*5;
            }
            CanShoot=visible;
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
        void ChooseMove(bool threatened)
        {
            if(navigation==null)return;
            Vector3 threat=TargetPoint;float best=float.PositiveInfinity;bool found=false;Vector3 chosen=transform.position;bool covered=false;
            var path=new NavMeshPath();
            for(int i=0;i<20;i++)
            {
                float angle=Random.Range(0,Mathf.PI*2);float radius=Random.Range(3f,9f);
                var p=transform.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*radius;
                if(!NavMesh.SamplePosition(p,out var end,1f,NavMesh.AllAreas) ||
                    !NavMesh.CalculatePath(transform.position,end.position,NavMesh.AllAreas,path) || path.status!=NavMeshPathStatus.PathComplete)continue;
                if(Physics.CheckCapsule(end.position+Vector3.up*.55f,end.position+Vector3.up*1.95f,.43f,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))continue;
                bool cover=EnemyProjectile.WorldHit(threat,end.position+Vector3.up*1.55f,owner,out var hit) && hit.collider.GetComponentInParent<EnemySoldier>()==null;
                if(!threatened && cover)continue; // Return fire from another open angle after a firing window.
                float score=radius+(threatened&&!cover?12:0)+Random.Range(0,2f);
                if(score>=best)continue;best=score;chosen=end.position;covered=cover;found=true;
            }
            if(!found){decisionAt=Time.time+1.2f;return;}
            destination=chosen;hasCover=covered;moving=true;moveUntil=Time.time+3f;stalled=0;navigation.Repath();
        }
    }
}
