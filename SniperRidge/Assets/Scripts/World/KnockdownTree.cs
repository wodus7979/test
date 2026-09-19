using UnityEngine;

namespace SniperRidge
{
    /// <summary>A trunk that a moving tank can push over without trapping its tracks.</summary>
    public sealed class KnockdownTree : MonoBehaviour
    {
        public bool IsFalling { get; private set; }
        public bool IsDown { get; private set; }

        Quaternion standingRotation, fallenRotation;
        float fallStarted;
        const float FallDuration = 1.15f;

        void OnCollisionEnter(Collision collision)
        {
            if (IsFalling || collision.rigidbody == null ||
                collision.rigidbody.GetComponentInParent<TankVehicle>() == null) return;
            Vector3 push = collision.rigidbody.velocity;
            push.y = 0f;
            if (push.sqrMagnitude < .8f) push = collision.rigidbody.transform.forward;
            KnockDown(push);
        }

        public void KnockDown(Vector3 direction)
        {
            if (IsFalling || IsDown) return;
            direction.y = 0f;
            if (direction.sqrMagnitude < .01f) direction = transform.forward;
            direction.Normalize();

            IsFalling = true;
            standingRotation = transform.rotation;
            Vector3 axis = Vector3.Cross(Vector3.up, direction).normalized;
            fallenRotation = Quaternion.AngleAxis(88f, axis) * standingRotation;
            fallStarted = Time.time;

            // Release the tank immediately; the visible trunk continues falling from
            // its rooted pivot while the heavy vehicle drives through the opening.
            foreach (var collider in GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            bool winter=name.Contains("Snow")||name.Contains("Frosted");
            Effects.Puff(transform.position + Vector3.up * .25f, Vector3.up, 1.45f,
                winter?new Color(.82f,.88f,.96f,.82f):new Color(.34f, .29f, .20f, .78f), 1.25f);
            Effects.Dust(transform.position + direction * .35f + Vector3.up * .4f, -direction, .7f);
        }

        void Update()
        {
            if (!IsFalling) return;
            float t = Mathf.Clamp01((Time.time - fallStarted) / FallDuration);
            float eased = 1f - Mathf.Pow(1f - t, 3f);
            transform.rotation = Quaternion.Slerp(standingRotation, fallenRotation, eased);
            if (t < 1f) return;
            IsFalling = false;
            IsDown = true;
            enabled = false;
        }
    }
}
