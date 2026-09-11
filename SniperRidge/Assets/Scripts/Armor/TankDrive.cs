using UnityEngine;

namespace SniperRidge
{
    /// <summary>Velocity motor with explicit traction/braking and solid Rigidbody collisions.</summary>
    public static class TankDrive
    {
        public const float Acceleration = 4f, Braking = 12f;

        public static PhysicMaterial Configure(Rigidbody body)
        {
            body.mass = 40000f;
            body.centerOfMass = new Vector3(0f, .65f, 0f);
            body.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
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

        public static void Step(Rigidbody body, float drive, float steering, float dt)
        {
            if (body == null || body.isKinematic || dt <= 0f) return;
            drive = Mathf.Clamp(drive, -1f, 1f);
            steering = Mathf.Clamp(steering, -1f, 1f);
            float current = Vector3.Dot(body.velocity, body.rotation * Vector3.forward);
            float target = drive * (drive >= 0f ? TankVehicle.ForwardSpeed : TankVehicle.ReverseSpeed);
            float rate = Mathf.Abs(drive) < .001f || current * target < 0f ? Braking : Acceleration;
            float speed = Mathf.MoveTowards(current, target, dt * rate);
            Quaternion turn = body.rotation * Quaternion.Euler(0f, steering * TankVehicle.TurnRate * dt, 0f);
            body.MoveRotation(turn);
            Vector3 planar = turn * Vector3.forward * speed;
            Vector3 next = body.position + planar * dt;
            if (Mathf.Abs(next.x) > TankBattle.Bounds || Mathf.Abs(next.z) > TankBattle.Bounds)
                planar = Vector3.zero;
            // Keep gravity and vertical contact response; walls/trees still stop the chassis.
            body.velocity = new Vector3(planar.x, body.velocity.y, planar.z);
        }
    }
}
