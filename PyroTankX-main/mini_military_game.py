import pygame
import math
import random
import sys
import os

pygame.init()
pygame.mixer.init()

WIDTH, HEIGHT = 900, 650
FPS = 60

WHITE   = (255, 255, 255)
BLACK   = (0, 0, 0)
GREEN   = (34, 85, 34)
DKGREEN = (20, 55, 20)
RED     = (200, 30, 30)
ORANGE  = (230, 120, 0)
YELLOW  = (240, 210, 0)
GRAY    = (120, 120, 120)
LTGRAY  = (180, 180, 180)
BLUE    = (50, 100, 200)
TAN     = (195, 165, 100)
BROWN   = (100, 65, 30)
DKRED   = (140, 0, 0)
CYAN    = (0, 210, 210)

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Mini Military — Tank Commander")
clock = pygame.time.Clock()

font_big   = pygame.font.SysFont("consolas", 54, bold=True)
font_med   = pygame.font.SysFont("consolas", 28, bold=True)
font_small = pygame.font.SysFont("consolas", 20)

def draw_tank(surface, x, y, angle, color, barrel_color, size=22):
    cx, cy = int(x), int(y)
    body_w, body_h = size * 2, int(size * 1.4)
    body_surf = pygame.Surface((body_w, body_h), pygame.SRCALPHA)
    pygame.draw.rect(body_surf, color, (0, 0, body_w, body_h), border_radius=5)
    pygame.draw.rect(body_surf, DKGREEN if color == TAN else DKRED,
                     (0, 0, body_w, body_h), 2, border_radius=5)
    track_w, track_h = body_w + 6, 8
    pygame.draw.rect(body_surf, GRAY, (-3, -4, track_w, track_h), border_radius=3)
    pygame.draw.rect(body_surf, GRAY, (-3, body_h - 4, track_w, track_h), border_radius=3)
    rotated = pygame.transform.rotate(body_surf, -angle)
    rrect = rotated.get_rect(center=(cx, cy))
    surface.blit(rotated, rrect)
    rad = math.radians(angle)
    blen = size + 12
    bx = cx + math.cos(rad) * blen
    by = cy + math.sin(rad) * blen
    pygame.draw.line(surface, barrel_color, (cx, cy), (int(bx), int(by)), 5)
    pygame.draw.circle(surface, (50, 50, 50), (cx, cy), size // 2 + 2)
    pygame.draw.circle(surface, barrel_color, (cx, cy), size // 2)

def draw_explosion(surface, x, y, frame, max_frames):
    if frame >= max_frames:
        return
    progress = frame / max_frames
    r = int(40 * math.sin(progress * math.pi))
    if r <= 0:
        return
    alpha = int(255 * (1 - progress))
    colors = [YELLOW, ORANGE, RED]
    for i, c in enumerate(reversed(colors)):
        sub_r = r - i * 6
        if sub_r > 0:
            s = pygame.Surface((sub_r * 2, sub_r * 2), pygame.SRCALPHA)
            a = max(0, alpha - i * 60)
            pygame.draw.circle(s, (*c, a), (sub_r, sub_r), sub_r)
            surface.blit(s, (int(x) - sub_r, int(y) - sub_r))

def draw_tree(surface, x, y):
    pygame.draw.rect(surface, BROWN, (x - 4, y, 8, 16))
    pygame.draw.circle(surface, (20, 90, 20), (x, y), 14)
    pygame.draw.circle(surface, (30, 110, 30), (x - 4, y - 4), 10)
    pygame.draw.circle(surface, (25, 100, 25), (x + 4, y - 4), 10)

def draw_rock(surface, x, y):
    pygame.draw.ellipse(surface, LTGRAY, (x - 14, y - 8, 28, 18))
    pygame.draw.ellipse(surface, GRAY,   (x - 14, y - 8, 28, 18), 2)

class Bullet:
    def __init__(self, x, y, angle, owner="player", speed=10):
        self.x = x
        self.y = y
        self.angle = angle
        self.speed = speed
        self.owner = owner
        self.alive = True
        self.trail = []

    def update(self):
        self.trail.append((int(self.x), int(self.y)))
        if len(self.trail) > 6:
            self.trail.pop(0)
        rad = math.radians(self.angle)
        self.x += math.cos(rad) * self.speed
        self.y += math.sin(rad) * self.speed
        if not (0 <= self.x <= WIDTH and 0 <= self.y <= HEIGHT):
            self.alive = False

    def draw(self, surface):
        for i, pos in enumerate(self.trail):
            alpha = int(180 * (i / len(self.trail)))
            r = 3
            s = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
            color = YELLOW if self.owner == "player" else RED
            pygame.draw.circle(s, (*color, alpha), (r, r), r)
            surface.blit(s, (pos[0] - r, pos[1] - r))
        color = YELLOW if self.owner == "player" else ORANGE
        pygame.draw.circle(surface, color, (int(self.x), int(self.y)), 4)
        pygame.draw.circle(surface, WHITE, (int(self.x), int(self.y)), 2)

class Player:
    def __init__(self):
        self.x = WIDTH // 2
        self.y = HEIGHT // 2
        self.angle = 0
        self.speed = 3.5
        self.hp = 5
        self.max_hp = 5
        self.shoot_cooldown = 0
        self.shoot_delay = 18
        self.invincible = 0

    def update(self, keys):
        if keys[pygame.K_LEFT] or keys[pygame.K_a]:
            self.angle -= 3
        if keys[pygame.K_RIGHT] or keys[pygame.K_d]:
            self.angle += 3
        if keys[pygame.K_UP] or keys[pygame.K_w]:
            rad = math.radians(self.angle)
            self.x += math.cos(rad) * self.speed
            self.y += math.sin(rad) * self.speed
        if keys[pygame.K_DOWN] or keys[pygame.K_s]:
            rad = math.radians(self.angle)
            self.x -= math.cos(rad) * self.speed * 0.6
            self.y -= math.sin(rad) * self.speed * 0.6
        self.x = max(25, min(WIDTH - 25, self.x))
        self.y = max(25, min(HEIGHT - 25, self.y))
        if self.shoot_cooldown > 0:
            self.shoot_cooldown -= 1
        if self.invincible > 0:
            self.invincible -= 1

    def shoot(self):
        if self.shoot_cooldown == 0:
            self.shoot_cooldown = self.shoot_delay
            rad = math.radians(self.angle)
            bx = self.x + math.cos(rad) * 35
            by = self.y + math.sin(rad) * 35
            return Bullet(bx, by, self.angle, "player", 10)
        return None

    def take_damage(self):
        if self.invincible == 0:
            self.hp -= 1
            self.invincible = 60
            return True
        return False

    def draw(self, surface):
        if self.invincible > 0 and (self.invincible // 6) % 2 == 0:
            return
        draw_tank(surface, self.x, self.y, self.angle, TAN, (160, 130, 70))

class Enemy:
    def __init__(self, level=1):
        side = random.randint(0, 3)
        if side == 0:
            self.x, self.y = random.randint(0, WIDTH), -30
        elif side == 1:
            self.x, self.y = WIDTH + 30, random.randint(0, HEIGHT)
        elif side == 2:
            self.x, self.y = random.randint(0, WIDTH), HEIGHT + 30
        else:
            self.x, self.y = -30, random.randint(0, HEIGHT)
        self.angle = 0
        base_speed = 1.0 + level * 0.18
        self.speed = base_speed + random.uniform(-0.2, 0.3)
        self.hp = 1 + (level // 3)
        self.shoot_cooldown = random.randint(40, 100)
        self.shoot_delay = max(40, 100 - level * 4)
        self.alive = True
        self.wobble = random.uniform(0, 360)

    def update(self, player):
        dx = player.x - self.x
        dy = player.y - self.y
        dist = math.hypot(dx, dy)
        if dist > 0:
            self.angle = math.degrees(math.atan2(dy, dx))
            self.wobble += 1.5
            wobble_offset = math.sin(math.radians(self.wobble)) * 1.2
            nx = self.x + (dx / dist) * self.speed
            ny = self.y + (dy / dist) * self.speed
            perp_rad = math.radians(self.angle + 90)
            self.x = nx + math.cos(perp_rad) * wobble_offset
            self.y = ny + math.sin(perp_rad) * wobble_offset
        if self.shoot_cooldown > 0:
            self.shoot_cooldown -= 1

    def shoot(self, player):
        if self.shoot_cooldown == 0:
            self.shoot_cooldown = self.shoot_delay
            dx = player.x - self.x
            dy = player.y - self.y
            angle = math.degrees(math.atan2(dy, dx))
            spread = random.uniform(-8, 8)
            return Bullet(self.x, self.y, angle + spread, "enemy", 6)
        return None

    def take_hit(self):
        self.hp -= 1
        if self.hp <= 0:
            self.alive = False
            return True
        return False

    def draw(self, surface):
        draw_tank(surface, self.x, self.y, self.angle, DKRED, (180, 50, 50))

class Explosion:
    def __init__(self, x, y, max_frames=24):
        self.x = x
        self.y = y
        self.frame = 0
        self.max_frames = max_frames

    def update(self):
        self.frame += 1

    def done(self):
        return self.frame >= self.max_frames

    def draw(self, surface):
        draw_explosion(surface, self.x, self.y, self.frame, self.max_frames)

class PowerUp:
    def __init__(self):
        self.x = random.randint(60, WIDTH - 60)
        self.y = random.randint(60, HEIGHT - 60)
        self.kind = random.choice(["health", "rapid", "shield"])
        self.alive = True
        self.anim = 0

    def update(self):
        self.anim += 2

    def draw(self, surface):
        bob = math.sin(math.radians(self.anim)) * 4
        cx, cy = int(self.x), int(self.y + bob)
        if self.kind == "health":
            pygame.draw.circle(surface, (20, 180, 20), (cx, cy), 14)
            pygame.draw.rect(surface, WHITE, (cx - 2, cy - 7, 4, 14))
            pygame.draw.rect(surface, WHITE, (cx - 7, cy - 2, 14, 4))
        elif self.kind == "rapid":
            pygame.draw.circle(surface, YELLOW, (cx, cy), 14)
            pygame.draw.line(surface, BLACK, (cx - 7, cy), (cx + 7, cy), 3)
            pygame.draw.polygon(surface, BLACK, [(cx + 4, cy - 6), (cx + 10, cy), (cx + 4, cy + 6)])
        else:
            pygame.draw.circle(surface, CYAN, (cx, cy), 14)
            pygame.draw.circle(surface, WHITE, (cx, cy), 10, 2)

_ground_surf = None
def get_ground():
    global _ground_surf
    if _ground_surf is None:
        _ground_surf = pygame.Surface((WIDTH, HEIGHT))
        _ground_surf.fill(GREEN)
        rng = random.Random(42)
        for i in range(0, WIDTH, 80):
            for j in range(0, HEIGHT, 80):
                shade = rng.randint(-10, 10)
                c = (max(0, min(60, 34 + shade)),
                     max(0, min(120, 85 + shade)),
                     max(0, min(60, 34 + shade)))
                pygame.draw.rect(_ground_surf, c, (i, j, 80, 80))
        for _ in range(18):
            x = rng.randint(30, WIDTH - 30)
            y = rng.randint(30, HEIGHT - 30)
            draw_tree(_ground_surf, x, y)
        for _ in range(12):
            x = rng.randint(30, WIDTH - 30)
            y = rng.randint(30, HEIGHT - 30)
            draw_rock(_ground_surf, x, y)
    return _ground_surf

# --- GAME STATE ---
STATE_START = 0
STATE_PLAY = 1
STATE_GAME_OVER = 2

def draw_text(surface, text, font, color, x, y, align="center"):
    text_obj = font.render(text, True, color)
    rect = text_obj.get_rect()
    if align == "center":
        rect.center = (x, y)
    elif align == "left":
        rect.topleft = (x, y)
    elif align == "right":
        rect.topright = (x, y)
    surface.blit(text_obj, rect)

def main():
    player = Player()
    bullets = []
    enemies = []
    explosions = []
    powerups = []

    score = 0
    high_score = 0
    
    # Load High Score if file exists
    hs_file = "highscore.txt"
    if os.path.exists(hs_file):
        try:
            with open(hs_file, "r") as f:
                high_score = int(f.read().strip())
        except:
            pass

    wave = 0
    wave_transition_timer = 0
    state = STATE_START

    rapid_fire_timer = 0
    shield_timer = 0
    powerup_spawn_timer = 600  # Spawn powerup every 10 seconds if none exists

    # UI Buttons
    play_btn = pygame.Rect(WIDTH // 2 - 100, HEIGHT // 2 + 50, 200, 50)
    restart_btn = pygame.Rect(WIDTH // 2 - 120, HEIGHT // 2 + 80, 240, 50)

    def start_new_game():
        nonlocal player, score, wave, wave_transition_timer, rapid_fire_timer, shield_timer
        player = Player()
        bullets.clear()
        enemies.clear()
        explosions.clear()
        powerups.clear()
        score = 0
        wave = 0
        wave_transition_timer = 0
        rapid_fire_timer = 0
        shield_timer = 0

    def spawn_wave():
        nonlocal wave
        wave += 1
        num_enemies = 3 + wave * 2
        for _ in range(num_enemies):
            enemies.append(Enemy(wave))

    running = True
    while running:
        clock.tick(FPS)
        mx, my = pygame.mouse.get_pos()
        click_detected = False

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:
                    click_detected = True

        keys = pygame.key.get_pressed()

        if state == STATE_START:
            # Handle Start Screen Input
            if click_detected and play_btn.collidepoint(mx, my):
                start_new_game()
                spawn_wave()
                state = STATE_PLAY
            elif keys[pygame.K_SPACE] or keys[pygame.K_RETURN]:
                start_new_game()
                spawn_wave()
                state = STATE_PLAY

        elif state == STATE_PLAY:
            # Powerup Timers
            if rapid_fire_timer > 0:
                rapid_fire_timer -= 1
                player.shoot_delay = 7
            else:
                player.shoot_delay = 18

            if shield_timer > 0:
                shield_timer -= 1

            # Update Player
            player.update(keys)

            # Player Shooting
            if keys[pygame.K_SPACE] or pygame.mouse.get_pressed()[0]:
                bullet = player.shoot()
                if bullet:
                    bullets.append(bullet)

            # Spawn Powerup over time
            powerup_spawn_timer -= 1
            if powerup_spawn_timer <= 0:
                powerup_spawn_timer = 900  # 15 seconds
                if len(powerups) < 3:
                    powerups.append(PowerUp())

            # Update Powerups
            for pu in powerups[:]:
                pu.update()
                # Check collision with player
                dist = math.hypot(player.x - pu.x, player.y - pu.y)
                if dist < 30:
                    if pu.kind == "health":
                        player.hp = min(player.max_hp, player.hp + 2)
                    elif pu.kind == "rapid":
                        rapid_fire_timer = 400
                    elif pu.kind == "shield":
                        shield_timer = 400
                    pu.alive = False
                    score += 50
                    powerups.remove(pu)

            # Update Enemies
            for enemy in enemies[:]:
                enemy.update(player)
                
                # Enemy shoots player
                ebullet = enemy.shoot(player)
                if ebullet:
                    bullets.append(ebullet)

                # Tank-tank collision (Ramming)
                dist_tanks = math.hypot(player.x - enemy.x, player.y - enemy.y)
                if dist_tanks < 35:
                    if shield_timer <= 0:
                        player.take_damage()
                    enemy.alive = False
                    explosions.append(Explosion(enemy.x, enemy.y))
                    enemies.remove(enemy)
                    score += 100

            # Update Bullets
            for bullet in bullets[:]:
                bullet.update()
                if not bullet.alive:
                    if bullet in bullets:
                        bullets.remove(bullet)
                    continue

                if bullet.owner == "player":
                    # Check collision with enemies
                    for enemy in enemies[:]:
                        dist = math.hypot(bullet.x - enemy.x, bullet.y - enemy.y)
                        if dist < 25:
                            bullet.alive = False
                            if enemy.take_hit():
                                score += 200
                                explosions.append(Explosion(enemy.x, enemy.y))
                                # Random powerup drop chance (15%)
                                if random.random() < 0.15:
                                    # Drop powerup at enemy location
                                    pu = PowerUp()
                                    pu.x, pu.y = enemy.x, enemy.y
                                    powerups.append(pu)
                                enemies.remove(enemy)
                            else:
                                # Spawn minor explosion sparks
                                explosions.append(Explosion(bullet.x, bullet.y, max_frames=10))
                            
                            if bullet in bullets:
                                bullets.remove(bullet)
                            break
                else:
                    # Enemy bullet check player collision
                    dist = math.hypot(bullet.x - player.x, bullet.y - player.y)
                    if dist < 24:
                        bullet.alive = False
                        if shield_timer <= 0:
                            player.take_damage()
                        explosions.append(Explosion(bullet.x, bullet.y, max_frames=12))
                        if bullet in bullets:
                            bullets.remove(bullet)

            # Update Explosions
            for exp in explosions[:]:
                exp.update()
                if exp.done():
                    explosions.remove(exp)

            # Check Wave progression
            if len(enemies) == 0:
                if wave_transition_timer == 0:
                    wave_transition_timer = 90  # 1.5 seconds delay before next wave
                else:
                    wave_transition_timer -= 1
                    if wave_transition_timer <= 1:
                        spawn_wave()
                        wave_transition_timer = 0

            # Check Game Over
            if player.hp <= 0:
                state = STATE_GAME_OVER
                if score > high_score:
                    high_score = score
                    try:
                        with open(hs_file, "w") as f:
                            f.write(str(high_score))
                    except:
                        pass

        elif state == STATE_GAME_OVER:
            if click_detected and restart_btn.collidepoint(mx, my):
                start_new_game()
                spawn_wave()
                state = STATE_PLAY
            elif keys[pygame.K_SPACE] or keys[pygame.K_RETURN]:
                start_new_game()
                spawn_wave()
                state = STATE_PLAY

        # --- DRAWING PHASE ---
        # Draw background
        screen.blit(get_ground(), (0, 0))

        if state == STATE_START:
            # Draw overlay
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((15, 30, 15, 180))  # Dark forest tint overlay
            screen.blit(overlay, (0, 0))

            # Beautiful Title
            draw_text(screen, "PyroTankX", font_big, YELLOW, WIDTH // 2, HEIGHT // 2 - 140)
            draw_text(screen, "Wave-Based 2D Tank Combat", font_small, TAN, WIDTH // 2, HEIGHT // 2 - 80)

            # Controls Box
            pygame.draw.rect(screen, (30, 60, 30), (WIDTH // 2 - 220, HEIGHT // 2 - 50, 440, 80), border_radius=8)
            pygame.draw.rect(screen, LTGRAY, (WIDTH // 2 - 220, HEIGHT // 2 - 50, 440, 80), 2, border_radius=8)
            draw_text(screen, "Controls: W,A,S,D / Arrow Keys to Move & Rotate", font_small, WHITE, WIDTH // 2, HEIGHT // 2 - 35)
            draw_text(screen, "Shoot: Spacebar or Mouse Click", font_small, WHITE, WIDTH // 2, HEIGHT // 2 - 10)

            # Play Button
            btn_color = DKGREEN if not play_btn.collidepoint(mx, my) else (40, 110, 40)
            pygame.draw.rect(screen, btn_color, play_btn, border_radius=10)
            pygame.draw.rect(screen, YELLOW, play_btn, 2, border_radius=10)
            draw_text(screen, "PLAY", font_med, WHITE, WIDTH // 2, HEIGHT // 2 + 45)

            # High Score
            draw_text(screen, f"HIGH SCORE: {high_score}", font_med, CYAN, WIDTH // 2, HEIGHT // 2 + 130)

        elif state == STATE_PLAY:
            # Draw powerups
            for pu in powerups:
                pu.draw(screen)

            # Draw player
            player.draw(screen)

            # Draw player shield circle if active
            if shield_timer > 0:
                # Pulsing shield visual
                pulse_r = 30 + int(math.sin(pygame.time.get_ticks() * 0.01) * 3)
                s = pygame.Surface((pulse_r * 2, pulse_r * 2), pygame.SRCALPHA)
                alpha = 80 + int(math.sin(pygame.time.get_ticks() * 0.01) * 40)
                pygame.draw.circle(s, (0, 240, 240, alpha), (pulse_r, pulse_r), pulse_r, 3)
                pygame.draw.circle(s, (0, 240, 240, 20), (pulse_r, pulse_r), pulse_r - 3)
                screen.blit(s, (int(player.x) - pulse_r, int(player.y) - pulse_r))

            # Draw enemies
            for enemy in enemies:
                enemy.draw(screen)

            # Draw bullets
            for bullet in bullets:
                bullet.draw(screen)

            # Draw explosions
            for exp in explosions:
                exp.draw(screen)

            # Draw HUD
            # Glassmorphism container for health
            hud_bg = pygame.Surface((250, 95), pygame.SRCALPHA)
            hud_bg.fill((20, 20, 20, 160))
            pygame.draw.rect(hud_bg, GRAY, (0, 0, 250, 95), 2, border_radius=5)
            screen.blit(hud_bg, (15, 15))

            # Health text
            draw_text(screen, "ARMOR STATUS", font_small, WHITE, 25, 23, align="left")
            
            # Health Bar segments
            bar_x, bar_y = 25, 48
            bar_w, bar_h = 200, 18
            pygame.draw.rect(screen, (50, 0, 0), (bar_x, bar_y, bar_w, bar_h), border_radius=3)
            # Calculate width based on hp ratio
            health_ratio = max(0.0, player.hp / player.max_hp)
            current_bar_w = int(bar_w * health_ratio)
            bar_color = RED if health_ratio <= 0.4 else GREEN
            if current_bar_w > 0:
                pygame.draw.rect(screen, bar_color, (bar_x, bar_y, current_bar_w, bar_h), border_radius=3)
            pygame.draw.rect(screen, WHITE, (bar_x, bar_y, bar_w, bar_h), 1, border_radius=3)

            # Shield active indicator
            if shield_timer > 0:
                draw_text(screen, f"SHIELD ACTIVE ({shield_timer // 60}s)", font_small, CYAN, 25, 75, align="left")
            # Rapid fire active indicator
            elif rapid_fire_timer > 0:
                draw_text(screen, f"RAPID FIRE ({rapid_fire_timer // 60}s)", font_small, YELLOW, 25, 75, align="left")

            # Score and Wave (Top Right HUD)
            hud_r_bg = pygame.Surface((220, 85), pygame.SRCALPHA)
            hud_r_bg.fill((20, 20, 20, 160))
            pygame.draw.rect(hud_r_bg, GRAY, (0, 0, 220, 85), 2, border_radius=5)
            screen.blit(hud_r_bg, (WIDTH - 235, 15))

            draw_text(screen, f"SCORE: {score}", font_med, YELLOW, WIDTH - 220, 23, align="left")
            draw_text(screen, f"WAVE:  {wave}", font_med, WHITE, WIDTH - 220, 52, align="left")

            # Wave incoming overlay text
            if wave_transition_timer > 0 and wave > 0:
                draw_text(screen, f"WAVE {wave + 1} INCOMING...", font_big, ORANGE, WIDTH // 2, HEIGHT // 2 - 50)

        elif state == STATE_GAME_OVER:
            # Draw semi-transparent overlay
            overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            overlay.fill((30, 10, 10, 200))
            screen.blit(overlay, (0, 0))

            # Game over texts
            draw_text(screen, "MISSION FAILED", font_big, RED, WIDTH // 2, HEIGHT // 2 - 130)
            draw_text(screen, "Your tank was obliterated.", font_small, TAN, WIDTH // 2, HEIGHT // 2 - 80)
            
            draw_text(screen, f"FINAL SCORE: {score}", font_med, YELLOW, WIDTH // 2, HEIGHT // 2 - 20)
            draw_text(screen, f"HIGH SCORE: {high_score}", font_med, CYAN, WIDTH // 2, HEIGHT // 2 + 20)

            # Restart Button
            btn_color = (120, 30, 30) if not restart_btn.collidepoint(mx, my) else (180, 40, 40)
            pygame.draw.rect(screen, btn_color, restart_btn, border_radius=10)
            pygame.draw.rect(screen, RED, restart_btn, 2, border_radius=10)
            draw_text(screen, "PLAY AGAIN", font_med, WHITE, WIDTH // 2, HEIGHT // 2 + 105)

            draw_text(screen, "Press Space or Enter to restart", font_small, GRAY, WIDTH // 2, HEIGHT // 2 + 160)

        pygame.display.flip()

    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()