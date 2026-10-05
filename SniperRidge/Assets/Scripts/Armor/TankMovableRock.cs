using UnityEngine;

namespace SniperRidge
{
    // Small battlefield boulders can be bulldozed; terrain and cliffs remain solid.
    public sealed class TankMovableRock : MonoBehaviour
    {
        Vector3 velocity;
        float groundOffset,nextDust;
        bool initialized;
        public bool Moving=>velocity.sqrMagnitude>.04f;
        public static void ClearPath(TankVehicle tank,float drive)
        {
            Vector3 direction=tank.transform.forward*Mathf.Sign(drive);
            Vector3 center=tank.transform.position+Vector3.up*1.1f+direction*3.7f;
            foreach(var c in Physics.OverlapBox(center,new Vector3(2.7f,2,2.4f),tank.transform.rotation,EnemyRagdoll.CombatMask,QueryTriggerInteraction.Ignore))
            {
                var rock=c.GetComponentInParent<TankMovableRock>();
                if(rock)rock.Push(tank,direction);
            }
        }
        void Push(TankVehicle tank,Vector3 direction)
        {
            var prop=GetComponent<RampageProp>();if(prop&&!prop.Available)return;
            var gm=GameManager.Instance;if(!gm)return;
            if(!initialized){initialized=true;groundOffset=transform.position.y-TerrainGenerator.GroundHeight(gm.Terrain,transform.position.x,transform.position.z);}
            float side=Vector3.Dot(transform.position-tank.transform.position,tank.transform.right)>=0?1:-1;
            velocity=Vector3.ProjectOnPlane(direction+tank.transform.right*side*.8f,Vector3.up).normalized*Mathf.Max(7,Mathf.Abs(tank.Speed)+3);
            if(Time.time>nextDust){nextDust=Time.time+.35f;Effects.Dust(transform.position,Vector3.up,.5f);}
        }
        public void StopMoving(){velocity=Vector3.zero;initialized=false;}
        void FixedUpdate()
        {
            var gm=GameManager.Instance;if(!gm||!gm.IsPlaying||!Moving)return;
            Vector3 p=transform.position+velocity*Time.fixedDeltaTime;
            p.x=Mathf.Clamp(p.x,-TankBattle.Bounds+2,TankBattle.Bounds-2);p.z=Mathf.Clamp(p.z,-TankBattle.Bounds+2,TankBattle.Bounds-2);
            p.y=TerrainGenerator.GroundHeight(gm.Terrain,p.x,p.z)+groundOffset;
            transform.position=p;
            velocity=Vector3.MoveTowards(velocity,Vector3.zero,7*Time.fixedDeltaTime);
        }
    }
}
