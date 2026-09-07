using UnityEngine;

namespace SniperRidge
{
    /// <summary>천천히 방향과 세기가 바뀌는 바람.</summary>
    public class WindSystem : MonoBehaviour
    {
        public Vector3 Wind { get; private set; }
        public float Speed => Wind.magnitude;

        Vector3 target;
        float nextChange;

        void Start()
        {
            PickTarget();
            Wind = target;
        }

        void Update()
        {
            if (Time.time > nextChange) PickTarget();
            Wind = Vector3.MoveTowards(Wind, target, Time.deltaTime * 0.6f);
        }

        void PickTarget()
        {
            float angle = Random.Range(0f, 360f);
            float speed = Random.Range(0.5f, 7f);
            target = Quaternion.Euler(0f, angle, 0f) * Vector3.forward * speed;
            nextChange = Time.time + Random.Range(8f, 16f);
        }
    }
}
