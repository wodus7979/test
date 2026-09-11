using System;
using System.Collections.Generic;
using UnityEngine;

namespace SniperRidge
{
    public enum BattlefieldMap { Field, City }

    /// <summary>One authored layout drives building placement, rooftop heights, spawns and the briefing map.</summary>
    public static class CityLayout
    {
        public const float BaseY = TerrainGenerator.FieldElevation + .04f;
        public const float EnemyScale = 1.5f;
        public const float CoverHeight = 1.65f;
        public const float CoverDistance = 1.725f;
        [Serializable] public class Building
        {
            public string asset;
            public float x, z, yaw, roof;
            public Vector3 Position => new Vector3(x, BaseY, z);
        }
        [Serializable] public class Prop
        {
            public string asset;
            public float x, y, z, yaw;
            public float[] scale;
        }
        [Serializable] public class CheckpointBox
        {
            public string name;
            public float x, y, z;
            public float[] size;
        }
        [Serializable] public class Post
        {
            public int building = -1;
            public float x, z;
            public bool sniper;
            public int color;
        }
        [Serializable] public class Layout
        {
            public Building[] buildings;
            public Post[] posts;
            public Prop[] props;
            public CheckpointBox[] checkpoint;
        }
        static Layout data;
        public static Layout Data
        {
            get
            {
                if (data == null)
                {
                    var source = Resources.Load<TextAsset>("Maps/city_combat");
                    if (source == null) throw new InvalidOperationException("도시 전투 배치 파일이 없습니다.");
                    data = JsonUtility.FromJson<Layout>(source.text);
                }
                return data;
            }
        }
        public static EnemySpawn Spawn(int postIndex)
        {
            var post = Data.posts[postIndex];
            float surface = post.building >= 0 ? BaseY + Data.buildings[post.building].roof : float.NaN;
            return new EnemySpawn(post.x, post.z, EnemyKind.Cover,
                role: post.sniper ? EnemyRole.Sniper : EnemyRole.MachineGunner,
                uniformVariant: post.color, surfaceY: surface);
        }
        public static List<EnemySpawn> SniperSpawns()
        {
            var spawns = new List<EnemySpawn>();
            for (int i = 0; i < Data.posts.Length; i++) spawns.Add(Spawn(i));
            return spawns;
        }
        public static int DefensePost(int index)
        {
            switch (index) { case 3: return 4; case 7: return 5; case 5: return 1; case 9: return 3; default: return -1; }
        }
        public static EnemySpawn DefenseSpawn(System.Random random, int wave, int index)
        {
            int post = DefensePost(index);
            if (post >= 0) return Spawn(post);
            // An open central avenue; no building or fixed post intersects these approach lanes.
            float x = Mathf.Lerp(-6f, 6f, (float)random.NextDouble());
            float forward = Mathf.Lerp(55f, 85f, (float)random.NextDouble()) + Mathf.Min(wave, 4) * 2f;
            int ordinal = index;
            foreach (int slot in new[] { 3, 5, 7, 9 }) if (index > slot) ordinal--;
            return new EnemySpawn(x, TerrainGenerator.PlayerSpawnZ + forward, EnemyKind.Rusher,
                role: EnemyRole.MachineGunner, uniformVariant: (ordinal + wave - 1) % EnemyCombatRoles.GunnerColors);
        }
        public static Vector3 Ground(EnemySpawn spawn) => new Vector3(spawn.Pos.x,
            float.IsNaN(spawn.SurfaceY) ? TerrainGenerator.FieldElevation : spawn.SurfaceY, spawn.Pos.y);
    }
}
