using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace SniperRidge
{
    public sealed class AssaultNavigation:MonoBehaviour
    {
        static readonly List<AssaultNavigation> active=new List<AssaultNavigation>();
        EnemySoldier owner;
        void OnEnable(){owner=GetComponent<EnemySoldier>();active.Add(this);}
        void OnDisable(){active.Remove(this);}
        readonly NavMeshPath path=new NavMeshPath();
        Vector3[] corners;
        int corner;
        float refresh;
        Vector3 lastTarget;
        float stepLimit=float.PositiveInfinity;
        public void Repath(){refresh=0;corners=null;}
        public Vector3 Direction(Vector3 target)
        {
            if(Time.time>=refresh || (target-lastTarget).sqrMagnitude>1f)
            {
                lastTarget=target;
                refresh=Time.time+.55f;
                if(NavMesh.SamplePosition(transform.position,out var start,2f,NavMesh.AllAreas) &&
                    NavMesh.SamplePosition(target,out var end,3f,NavMesh.AllAreas) &&
                    NavMesh.CalculatePath(start.position,end.position,NavMesh.AllAreas,path) && path.status==NavMeshPathStatus.PathComplete)
                {corners=path.corners;corner=1;}
                else corners=null;
            }
            stepLimit=float.PositiveInfinity;
            if(corners==null)return Vector3.zero;
            if(!NavMesh.SamplePosition(transform.position,out var current,1f,NavMesh.AllAreas))return Vector3.zero;
            // Skip a bend only when the next segment is clear, so agents cannot cut into a building corner.
            while(corner+1<corners.Length && !NavMesh.Raycast(current.position,corners[corner+1],out var barrier,NavMesh.AllAreas))corner++;
            if(corner>=corners.Length)return Vector3.zero;
            var dir=corners[corner]-current.position;dir.y=0;
            while(dir.sqrMagnitude<.04f && corner+1<corners.Length)
            {corner++;dir=corners[corner]-current.position;dir.y=0;}
            stepLimit=dir.magnitude;
            return stepLimit<.06f?Vector3.zero:dir.normalized;
        }
        public void Move(Vector3 direction,float speed,float dt)
        {
            if(direction.sqrMagnitude<.001f)return;
            Vector3 separation=Vector3.zero;
            foreach(var other in active)
            {
                if(other==null||other==this||other.owner==null||other.owner.IsDead)continue;
                var delta=transform.position-other.transform.position;delta.y=0;
                float distance=delta.magnitude;
                if(distance>.001f && distance<1.35f)separation+=delta/distance*(1.35f-distance)/1.35f;
            }
            var advance=(direction.normalized+Vector3.ClampMagnitude(separation,1f)*1.1f).normalized;
            if(!NavMesh.SamplePosition(transform.position,out var start,1f,NavMesh.AllAreas))return;
            // Project both ends onto the navigation surface; terrain and baked mesh heights differ.
            var next=start.position+advance*Mathf.Min(speed*dt,stepLimit);
            if(NavMesh.Raycast(start.position,next,out var edge,NavMesh.AllAreas))next=edge.position;
            if(NavMesh.SamplePosition(next,out var hit,.5f,NavMesh.AllAreas))transform.position=hit.position;
        }
    }
}
