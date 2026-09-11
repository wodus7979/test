using UnityEngine;

namespace SniperRidge
{
    /// <summary>Automatic right-door orbit. The player aims locally within the open door.</summary>
    [DefaultExecutionOrder(-200)]
    public sealed class HelicopterFlight : MonoBehaviour
    {
        public const float OrbitSeconds = 52f;
        public const float CityRadius = 92f, FieldRadius = 82f;
        public const float CityAltitude = 66f, FieldAltitude = 44f;
        public const float Traverse = 50f, MinElevation = 5f, MaxDepression = 55f;
        public Transform GunnerStation { get; private set; }
        public Vector3 Velocity { get; private set; }
        public float Altitude => gm.Map == BattlefieldMap.City ? CityAltitude : FieldAltitude;
        public float Radius => gm.Map == BattlefieldMap.City ? CityRadius : FieldRadius;
        public float Laps => elapsed / OrbitSeconds;
        GameManager gm;
        float elapsed;
        Transform rotor, tailRotor;
        AudioSource rotorSound, engineSound;
        public static Vector3 Centre(BattlefieldMap map) => new Vector3(0f, TerrainGenerator.FieldElevation,
            map == BattlefieldMap.City ? -24f : -30f);
        public static Vector3 Position(BattlefieldMap map, float seconds)
        {
            float theta = Mathf.PI + seconds * Mathf.PI * 2f / OrbitSeconds;
            float radius = map == BattlefieldMap.City ? CityRadius : FieldRadius;
            float height = map == BattlefieldMap.City ? CityAltitude : FieldAltitude;
            return Centre(map) + new Vector3(Mathf.Sin(theta) * radius,
                height + Mathf.Sin(seconds * 1.3f) * .10f, Mathf.Cos(theta) * radius);
        }
        // Keep the view above the floor and sill even at the door's traverse limits.
        public static float DepressionLimit(float yaw) => Mathf.Min(MaxDepression,
            Mathf.Atan2(1.55f * Mathf.Cos(yaw * Mathf.Deg2Rad), 1.12f) * Mathf.Rad2Deg);
        public static Quaternion Heading(float seconds)
        {
            float theta = Mathf.PI + seconds * Mathf.PI * 2f / OrbitSeconds;
            return Quaternion.LookRotation(new Vector3(Mathf.Cos(theta), 0f, -Mathf.Sin(theta)))
                * Quaternion.Euler(.4f * Mathf.Sin(seconds * .7f), 0f, -3f);
        }
        public static HelicopterFlight Create(GameManager game)
        {
            var flight = new GameObject("Orbiting Helicopter").AddComponent<HelicopterFlight>();
            flight.gm = game;
            flight.transform.SetPositionAndRotation(Position(game.Map, 0f), Heading(0f));
            HelicopterVisual.Build(flight.transform, out flight.rotor, out flight.tailRotor);
            flight.GunnerStation = new GameObject("Right Door Gunner Station").transform;
            flight.GunnerStation.SetParent(flight.transform, false);
            flight.GunnerStation.localPosition = new Vector3(1.35f, 0f, 0f);
            flight.GunnerStation.localRotation = Quaternion.Euler(0f, 90f, 0f);
            game.Player.AttachToHelicopter(flight);
            flight.rotorSound = flight.Loop("helicopter_rotor", .20f);
            flight.engineSound = flight.Loop("helicopter_engine", .13f);
            if (game.Ambience != null) game.Ambience.Stop();
            return flight;
        }
        AudioSource Loop(string clipName, float volume)
        {
            var source = gameObject.AddComponent<AudioSource>();
            source.clip = Resources.Load<AudioClip>("Audio/" + clipName);
            source.loop = true; source.playOnAwake = false; source.spatialBlend = 0f;
            source.volume = volume; source.priority = 48;
            if (source.clip != null) source.Play();
            else Debug.LogError("[Sniper Ridge] 헬기 비행음 누락: " + clipName);
            return source;
        }
        void Update()
        {
            if (gm == null || !gm.IsPlaying) return;
            Vector3 previous = transform.position;
            elapsed += Time.deltaTime;
            transform.SetPositionAndRotation(Position(gm.Map, elapsed), Heading(elapsed));
            Velocity = (transform.position - previous) / Mathf.Max(Time.deltaTime, .0001f);
            rotor.localRotation = Quaternion.Euler(0f, elapsed * 1620f, 0f);
            tailRotor.localRotation = Quaternion.Euler(elapsed * 2400f, 0f, 0f);
            // Slow, small load modulation; the loop itself provides the blade-passage rhythm.
            rotorSound.pitch = 1f + Mathf.Sin(elapsed * .4f) * .008f;
            engineSound.pitch = 1f + Mathf.Sin(elapsed * .3f) * .01f;
        }
        public void StopFlight()
        {
            Velocity = Vector3.zero;
            if (rotorSound != null) rotorSound.Stop();
            if (engineSound != null) engineSound.Stop();
        }
    }
}
