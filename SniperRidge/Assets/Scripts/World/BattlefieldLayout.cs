using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    /// <summary>Distances are measured from the player's trench, not absolute map coordinates.</summary>
    public static class BattlefieldLayout
    {
        public static Vector2 PlayerXZ => new Vector2(0f, TerrainGenerator.PlayerSpawnZ);

        public static List<EnemySpawn> SniperSpawns()
        {
            float[] angles = { -32f, -25f, -18f, -11f, -4f, 4f, 11f, 18f, 25f, 32f };
            float[] ranges = { 95f, 64f, 86f, 48f, 104f, 74f, 46f, 95f, 62f, 88f };
            EnemyKind[] kinds = { EnemyKind.Cover, EnemyKind.Tree, EnemyKind.Cover, EnemyKind.Patrol,
                EnemyKind.Tree, EnemyKind.Cover, EnemyKind.Tree, EnemyKind.Patrol, EnemyKind.Cover, EnemyKind.Tree };
            var result = new List<EnemySpawn>();
            for (int i = 0; i < angles.Length; i++)
            {
                Vector2 point = AtRange(angles[i], ranges[i]);
                // Different sight angles prevent a nearby cover object from hiding the entire rear row.
                Vector2 other = point + new Vector2(2.2f, .8f);
                result.Add(new EnemySpawn(point.x, point.y, kinds[i], other.x, other.y));
            }
            return result;
        }

        public static Vector2 DefenseSpawn(System.Random random, int wave)
        {
            float angle = Mathf.Lerp(-32f, 32f, (float)random.NextDouble());
            float distance = Mathf.Lerp(55f, 85f, (float)random.NextDouble()) + Mathf.Min(wave, 4) * 2f;
            return AtRange(angle, distance);
        }

        static Vector2 AtRange(float degrees, float distance)
        {
            float angle = degrees * Mathf.Deg2Rad;
            return PlayerXZ + new Vector2(Mathf.Sin(angle), Mathf.Cos(angle)) * distance;
        }

        // Keep random decoration out of the engagement fan; authored enemy cover is placed separately.
        public static bool IsCombatLane(float x, float z)
        {
            float forward = z - TerrainGenerator.PlayerSpawnZ;
            return forward >= -3f && forward <= 120f && Mathf.Abs(x) < 9f + Mathf.Max(0f, forward) * .72f;
        }
    }
}
