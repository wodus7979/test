using UnityEngine;

namespace SniperRidge
{
    /// <summary>Velocity motor with explicit traction/braking and solid Rigidbody collisions.</summary>
    public static class TankDrive
    {
        public const float Acceleration = 4f, Braking = 12f;
        static readonly float[] TrackX={-1.5f,1.5f},TrackZ={-3.7f,0f,3.7f};

        public static PhysicMaterial Configure(Rigidbody body,bool slopes=false)
        {
            body.mass = 40000f;
            body.centerOfMass = new Vector3(0f, .65f, 0f);
            body.constraints = slopes?RigidbodyConstraints.None:RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.drag = 0f;
            body.angularDrag = 5f;
            // The motor controls planar grip and braking. Contact friction must not erase
            // its small first acceleration step (4 m/s² versus roughly 6 m/s² of friction).
            var contact = new PhysicMaterial("Tank motor contact") {
                dynamicFriction = 0f, staticFriction = 0f,
                frictionCombine = PhysicMaterialCombine.Minimum,
                bounciness = 0f, bounceCombine = PhysicMaterialCombine.Minimum
            };
            foreach (var collider in body.GetComponentsInChildren<Collider>())
                collider.sharedMaterial = contact;
            return contact;
        }

        public static void Step(Rigidbody body, float drive, float steering, float dt,Terrain terrain=null)
        {
            if (body == null || body.isKinematic || dt <= 0f) return;
            drive = Mathf.Clamp(drive, -1f, 1f);
            steering = Mathf.Clamp(steering, -1f, 1f);
            float current = Vector3.Dot(body.velocity, body.rotation * Vector3.forward);
            float target = drive * (drive >= 0f ? TankVehicle.ForwardSpeed : TankVehicle.ReverseSpeed);
            float rate = Mathf.Abs(drive) < .001f || current * target < 0f ? Braking : Acceleration;
            float speed = Mathf.MoveTowards(current, target, dt * rate);
            Quaternion turn = body.rotation * Quaternion.Euler(0f, steering * TankVehicle.TurnRate * dt, 0f);
            if(terrain!=null)
            {
                Vector3 normal=TankCanyon.Normal(terrain,body.position);
                Vector3 forward=Vector3.ProjectOnPlane(turn*Vector3.forward,normal).normalized;
                turn=Quaternion.Slerp(turn,Quaternion.LookRotation(forward,normal),1f-Mathf.Exp(-8f*dt));
                body.angularVelocity=Vector3.zero;
            }
            body.MoveRotation(turn);
            Vector3 planar = turn * Vector3.forward * speed;
            Vector3 next = body.position + planar * dt;
            if (Mathf.Abs(next.x) > TankBattle.Bounds || Mathf.Abs(next.z) > TankBattle.Bounds)
                planar = Vector3.zero;
            if(terrain!=null)
            {
                // Reject steep rock faces and support both tracks on the sampled terrain.
                Vector3 normal=TankCanyon.Normal(terrain,next);
                if(normal.y<.90f&&Vector3.Dot(new Vector3(planar.x,0,planar.z),normal)<0f)planar=Vector3.zero;
                float support=SupportHeight(body.position,turn,body.transform.localScale.x,terrain);
                float gap=body.position.y-support;
                float vertical=body.velocity.y;
                if(gap<.75f)vertical=planar.y+Mathf.Clamp(-gap*10f,-3f,4f);
                body.velocity=new Vector3(planar.x,vertical,planar.z);
                return;
            }
            // Keep gravity and vertical contact response; walls/trees still stop the chassis.
            body.velocity = new Vector3(planar.x, body.velocity.y, planar.z);
        }
        public static float SupportHeight(Vector3 position,Quaternion rotation,float scale,Terrain terrain)
        {
            float support=float.NegativeInfinity;
            foreach(float x in TrackX)foreach(float z in TrackZ)
            {
                Vector3 offset=rotation*new Vector3(x*scale,0,z*scale),p=position+offset;
                support=Mathf.Max(support,TerrainGenerator.GroundHeight(terrain,p.x,p.z)-offset.y);
            }
            return support+.025f;
        }
    }
}
