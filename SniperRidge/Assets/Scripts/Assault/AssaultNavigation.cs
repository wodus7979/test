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
        public void Repath(){refresh=0;corners=null;}
        public Vector3 Direction(Vector3 target)
        {
            if(Time.time>=refresh)
            {
                refresh=Time.time+.55f;
                if(NavMesh.SamplePosition(transform.position,out var start,2f,NavMesh.AllAreas) &&
                    NavMesh.SamplePosition(target,out var end,3f,NavMesh.AllAreas) &&
                    NavMesh.CalculatePath(start.position,end.position,NavMesh.AllAreas,path) && path.status==NavMeshPathStatus.PathComplete)
                {corners=path.corners;corner=1;}
                else corners=null;
            }
            if(corners==null)return Vector3.zero;
            if(!NavMesh.SamplePosition(transform.position,out var current,1f,NavMesh.AllAreas))return Vector3.zero;
            // Skip a bend only when the next segment is clear, so agents cannot cut into a building corner.
            while(corner+1<corners.Length && !NavMesh.Raycast(current.position,corners[corner+1],out var barrier,NavMesh.AllAreas))corner++;
            if(corner>=corners.Length || Vector3.Distance(transform.position,corners[corner])<.08f)return Vector3.zero;
            var dir=corners[corner]-transform.position;dir.y=0;return dir.normalized;
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
            var next=transform.position+advance*speed*dt;
            if(!NavMesh.SamplePosition(transform.position,out var start,1f,NavMesh.AllAreas))return;
            if(NavMesh.Raycast(start.position,next,out var edge,NavMesh.AllAreas))next=edge.position;
            if(NavMesh.SamplePosition(next,out var hit,.5f,NavMesh.AllAreas))transform.position=hit.position;
        }
    }
}
