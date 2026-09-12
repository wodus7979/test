using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    // Local decisions for mobile city infantry. Cover is checked against real world colliders;
    // targets are remembered from sight/nearby fire, not updated through buildings.
    public sealed class AssaultTactics:MonoBehaviour
    {
        public enum Action { Advance, SeekCover, Hide, Peek, Flank }
        static readonly List<AssaultTactics> active=new List<AssaultTactics>();
        readonly NavMeshPath path=new NavMeshPath();
        EnemySoldier owner;
        AssaultNavigation navigation;
        Vector3 knownEye, goal, shelter;
        bool informed, visible, hasShelter;
        float nextSense, nextDecision, deadline, threatenedUntil, reactionAt, watched;
        int side, peeks;
        public Action Current { get; private set; }
        public Vector3 Direction { get; private set; }
        public Vector3 LookTarget => visible || Current==Action.Hide ? knownEye : transform.position+Direction*5;
        public float Speed { get; private set; }
        public float Crouch { get; private set; }
        public bool CanShoot { get; private set; }

        void Awake(){owner=GetComponent<EnemySoldier>();navigation=GetComponent<AssaultNavigation>();}
        void OnEnable(){active.Add(this);side=Random.value<.5f?-1:1;nextSense=Time.time+Random.Range(0,.2f);}
        void OnDisable(){active.Remove(this);}

        public void Suppress(Vector3 source)
        {
            if(owner==null||owner.IsDead)return;
            if(Time.time>=threatenedUntil)reactionAt=Time.time+Random.Range(.25f,.55f);
            threatenedUntil=Time.time+1.4f;
            knownEye=source;informed=true;
        }

        public void Tick(GameManager gm,float dt)
        {
            float now=Time.time;
            Direction=Vector3.zero;Speed=0;CanShoot=false;Crouch=0;
            if(!informed){knownEye=gm.PlayerEye.position;informed=true;goal=knownEye;}
            if(now>=nextSense)
            {
                nextSense=now+.22f;
                visible=owner.CanSee(gm.PlayerEye.position);
                if(visible)knownEye=gm.PlayerEye.position;
                Vector3 toMe=(owner.Head.position-gm.PlayerEye.position).normalized;
                // Require sustained aim and an unobstructed view, with a human-scale delay.
                watched=visible && Vector3.Dot(gm.PlayerEye.forward,toMe)>.975f ? watched+.22f : 0;
                if(watched>.45f)Suppress(gm.PlayerEye.position);
            }
            bool threatened=now<threatenedUntil && now>=reactionAt;
            if(threatened && now>=nextDecision && Current!=Action.SeekCover && Current!=Action.Hide)
                Evade(now);

            switch(Current)
            {
                case Action.Advance:
                    if(now>=nextDecision && visible)
                    {
                        // Even an unobserved rear attacker changes position after a short firing window.
                        if(FindCover(out var cover)){shelter=cover;hasShelter=true;peeks=0;Begin(Action.SeekCover,cover,6f);}
                        else BeginFlank();
                        nextDecision=now+1.2f;
                    }
                    if(Current!=Action.Advance)break;
                    Move(knownEye,3.1f);
                    CanShoot=visible&&!threatened;
                    break;
                case Action.SeekCover:
                    Move(goal,4.6f);
                    if(FlatDistance(transform.position,goal)<.3f)
                    {
                        if(Protected(transform.position))Begin(Action.Hide,goal,Random.Range(1f,1.8f));
                        else {hasShelter=false;BeginFlank();}
                    }
                    else if(now>=deadline)Resume();
                    break;
                case Action.Hide:
                    Crouch=1;
                    if(now>=deadline || !Protected(transform.position))
                    {
                        if(peeks<2 && FindPeek(out var peek)){peeks++;Begin(Action.Peek,peek,5f);}
                        else {hasShelter=false;BeginFlank();}
                    }
                    break;
                case Action.Peek:
                    Move(goal,2.8f);
                    if(FlatDistance(transform.position,goal)<.25f)
                    {
                        // Start the exposure clock on arrival, not while walking around a wall.
                        if(Speed>0){Speed=0;Direction=Vector3.zero;}
                        CanShoot=visible&&!threatened;
                        if(exposedAt<0)exposedAt=now;
                    }
                    if((exposedAt>=0 && now-exposedAt>2.1f) || now>=deadline)
                    {
                        if(hasShelter && peeks<2 && Protected(shelter))Begin(Action.SeekCover,shelter,5f);
                        else {hasShelter=false;BeginFlank();}
                    }
                    break;
                case Action.Flank:
                    Move(goal,threatened?4.5f:3.5f);
                    CanShoot=visible&&!threatened;
                    if(FlatDistance(transform.position,goal)<.7f || now>=deadline)Resume();
                    break;
            }
        }
        float exposedAt=-1;
        void Begin(Action action,Vector3 destination,float seconds)
        {
            Current=action;goal=destination;deadline=Time.time+seconds;exposedAt=-1;
            CanShoot=false;Direction=Vector3.zero;Speed=0;Crouch=action==Action.Hide?1f:0;
            navigation.Repath();
        }
        void Resume(){Begin(Action.Advance,knownEye,0);nextDecision=Time.time+Random.Range(.9f,1.7f);hasShelter=false;}
        void Evade(float now)
        {
            nextDecision=now+1.1f;
            if(hasShelter && peeks<2 && Protected(shelter))Begin(Action.SeekCover,shelter,5f);
            else if(FindCover(out var cover)){shelter=cover;hasShelter=true;peeks=0;Begin(Action.SeekCover,cover,6f);}
            else {hasShelter=false;BeginFlank();}
        }
        void BeginFlank()
        {
            side=-side;
            Vector3 away=transform.position-knownEye;away.y=0;away.Normalize();
            Vector3 lateral=Vector3.Cross(Vector3.up,away)*side;
            for(int i=0;i<6;i++)
            {
                float distance=4f+i/2*3f;
                Vector3 candidate=transform.position+lateral*(i%2==0?distance:-distance)+away*2f;
                if(Reachable(candidate,16f,out var point) && !Occupied(point))
                {Begin(Action.Flank,point,5f);return;}
            }
            Resume(); // Retry shortly; never wait forever for a cover point or path.
        }
        void Move(Vector3 destination,float speed)
        {
            Direction=navigation.Direction(destination);Speed=Direction.sqrMagnitude>.001f?speed:0;
        }
        bool FindCover(out Vector3 best)
        {
            best=default;float score=float.PositiveInfinity;bool found=false;
            for(int ring=0;ring<4;ring++)for(int i=0;i<12;i++)
            {
                float radius=2.5f+ring*3.5f;
                float angle=(i*30f+side*13f)*Mathf.Deg2Rad;
                var candidate=transform.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*radius;
                if(hasShelter && peeks>=2 && FlatDistance(candidate,shelter)<3f)continue;
                // Cheap occlusion rejection before the more expensive NavMesh path calculation.
                if(!Protected(candidate) || !Reachable(candidate,radius*1.7f+2f,out var point) || !Protected(point) || Occupied(point))continue;
                float preferredDistance=owner.Health<45f?22f:14f;
                float value=FlatDistance(transform.position,point)+Mathf.Abs(FlatDistance(point,knownEye)-preferredDistance)*.25f;
                if(value>=score)continue;
                score=value;best=point;found=true;
            }
            return found;
        }
        bool FindPeek(out Vector3 best)
        {
            best=default;
            for(int ring=0;ring<3;ring++)for(int i=0;i<12;i++)
            {
                float angle=(i*30f+side*13f)*Mathf.Deg2Rad;
                var candidate=shelter+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*(1.5f+ring*1.5f);
                if(Reachable(candidate,9f,out var point) && !Occupied(point) &&
                    !EnemyProjectile.WorldHit(point+Vector3.up*1.8f,knownEye,owner,out _))
                {best=point;return true;}
            }
            return false;
        }
        bool Protected(Vector3 point)
        {
            // Include the crouched head and both shoulders of the enlarged infantry model.
            Vector3 flank=Vector3.Cross(Vector3.up,knownEye-point).normalized*.35f;
            return WorldCover(knownEye,point+Vector3.up*1.6f) &&
                WorldCover(knownEye,point+Vector3.up*.9f) &&
                WorldCover(knownEye,point+Vector3.up*1.45f+flank) &&
                WorldCover(knownEye,point+Vector3.up*1.45f-flank);
        }
        bool WorldCover(Vector3 from,Vector3 to)
            => EnemyProjectile.WorldHit(from,to,owner,out var hit) && hit.collider.GetComponentInParent<EnemySoldier>()==null;
        bool Reachable(Vector3 candidate,float maxPath,out Vector3 point)
        {
            point=default;
            if(!NavMesh.SamplePosition(candidate,out var end,.8f,NavMesh.AllAreas) ||
                !NavMesh.SamplePosition(transform.position,out var start,1f,NavMesh.AllAreas))return false;
            if(Physics.CheckCapsule(end.position+Vector3.up*.55f,end.position+Vector3.up*1.95f,.48f,
                EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))return false;
            if(!NavMesh.CalculatePath(start.position,end.position,NavMesh.AllAreas,path) || path.status!=NavMeshPathStatus.PathComplete)return false;
            float length=0;var corners=path.corners;
            for(int i=1;i<corners.Length;i++)length+=Vector3.Distance(corners[i-1],corners[i]);
            if(length>maxPath || length<1f)return false;
            point=end.position;return true;
        }
        bool Occupied(Vector3 point)
        {
            foreach(var other in active)
            {
                if(other==null||other==this||other.owner==null||other.owner.IsDead)continue;
                if(FlatDistance(other.transform.position,point)<1.8f)return true;
                if(other.Current!=Action.Advance && FlatDistance(other.goal,point)<1.8f)return true;
            }
            return false;
        }
        static float FlatDistance(Vector3 a,Vector3 b){a.y=b.y=0;return Vector3.Distance(a,b);}
    }
}
