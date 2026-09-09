using UnityEngine;

namespace SniperRidge
{
    /// <summary>Identical fixed steps for the aiming preview and the live grenade.</summary>
    public static class GrenadeTrajectory
    {
        public const float StepSeconds = .02f;
        public const int FuseSteps = 160;
        public const float Radius = .065f;
        public const float MaxRange = 50f;
        public const float MaxSpeed = 28f;
        public static readonly Vector3 Gravity = Vector3.down * 9.81f;
        public struct State
        {
            public Vector3 Position, Velocity;
            public bool Resting;
        }

        public static bool TryLaunch(Vector3 origin, Vector3 target, out Vector3 velocity)
        {
            Vector3 delta = target - origin;
            float distance = Vector3.ProjectOnPlane(delta, Vector3.up).magnitude;
            float time = Mathf.Clamp(distance / 18f + .55f, .6f, 2.4f);
            velocity = (delta - .5f * Gravity * time * time) / time;
            return distance <= MaxRange && velocity.sqrMagnitude <= MaxSpeed * MaxSpeed;
        }

        public static bool ClearRelease(Vector3 eye, Vector3 origin)
        {
            Vector3 reach = origin - eye;
            return !Physics.CheckSphere(origin, Radius, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore) &&
                !Physics.SphereCast(eye, Radius, reach.normalized, out _, reach.magnitude,
                    EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore);
        }

        public static Vector3 Bounce(Vector3 velocity, Vector3 normal)
        {
            float inward = Vector3.Dot(velocity, normal);
            if (inward >= 0f) return velocity;
            return Vector3.ProjectOnPlane(velocity, normal) * .58f - normal * inward * .32f;
        }

        public static void Step(ref State state)
        {
            if (state.Resting)
            {
                // A grenade resting on a moving actor should fall when its support moves away.
                if (Physics.SphereCast(state.Position + Vector3.up * .01f, Radius, Vector3.down,
                    out RaycastHit support, .05f, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore) && support.normal.y > .55f) return;
                state.Resting = false;
            }
            Vector3 move = state.Velocity * StepSeconds + .5f * Gravity * StepSeconds * StepSeconds;
            state.Velocity += Gravity * StepSeconds;
            float distance = move.magnitude;
            if (distance > .000001f && Physics.SphereCast(state.Position, Radius, move / distance,
                out RaycastHit hit, distance, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
            {
                state.Position = hit.point + hit.normal * (Radius + .003f);
                state.Velocity = Bounce(state.Velocity, hit.normal);
                if (hit.normal.y > .55f && state.Velocity.sqrMagnitude < .64f)
                { state.Velocity = Vector3.zero; state.Resting = true; }
            }
            else state.Position += move;
        }

        public static Vector3 Predict(Vector3 origin, Vector3 velocity, Vector3[] points)
        {
            var state = new State { Position = origin, Velocity = velocity };
            points[0] = origin;
            for (int i = 0; i < FuseSteps; i++)
            { Step(ref state); points[i + 1] = state.Position; }
            return state.Position;
        }
    }
}
