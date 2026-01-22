import express from 'express';
import { prisma } from '../services/prisma.js';
import { authenticate } from '../middleware/auth.js';

// Note: After adding the Friendship model to schema.prisma, run:
// npx prisma migrate dev --name add_friendships
// npx prisma generate

// Cast prisma to access the friendship model (requires Prisma client regeneration)
const db = prisma as any;

// Type definitions for friendship-related queries
interface FriendUser {
  id: string;
  username: string;
  eloRating: number;
}

interface FriendshipRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sender?: FriendUser;
  receiver?: FriendUser;
}

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get friends list (accepted friendships)
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const friendships: FriendshipRecord[] = await db.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        sender: {
          select: { id: true, username: true, eloRating: true },
        },
        receiver: {
          select: { id: true, username: true, eloRating: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map to a clean friend list
    const friends = friendships.map((f) => {
      const friend = f.senderId === userId ? f.receiver! : f.sender!;
      return {
        id: f.id,
        friendId: friend.id,
        username: friend.username,
        eloRating: friend.eloRating,
        since: f.createdAt,
      };
    });

    res.json({ friends });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Get pending friend requests (received)
router.get('/requests', async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const requests: FriendshipRecord[] = await db.friendship.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: { id: true, username: true, eloRating: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pendingRequests = requests.map((r) => ({
      id: r.id,
      fromUserId: r.sender!.id,
      fromUsername: r.sender!.username,
      eloRating: r.sender!.eloRating,
      sentAt: r.createdAt,
    }));

    res.json({ requests: pendingRequests });
  } catch (error) {
    console.error('Error fetching friend requests:', error);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// Get sent friend requests (pending)
router.get('/requests/sent', async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const requests: FriendshipRecord[] = await db.friendship.findMany({
      where: {
        senderId: userId,
        status: 'PENDING',
      },
      include: {
        receiver: {
          select: { id: true, username: true, eloRating: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sentRequests = requests.map((r) => ({
      id: r.id,
      toUserId: r.receiver!.id,
      toUsername: r.receiver!.username,
      eloRating: r.receiver!.eloRating,
      sentAt: r.createdAt,
    }));

    res.json({ requests: sentRequests });
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// Send friend request
router.post('/request', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find target user
    const targetUser = await prisma.user.findUnique({
      where: { username },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists (in either direction)
    const existingFriendship: FriendshipRecord | null = await db.friendship.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: userId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return res.status(400).json({ error: 'Already friends with this user' });
      }
      if (existingFriendship.status === 'PENDING') {
        // If they sent us a request, auto-accept
        if (existingFriendship.senderId === targetUser.id) {
          const updated = await db.friendship.update({
            where: { id: existingFriendship.id },
            data: { status: 'ACCEPTED' },
          });
          return res.json({
            message: 'Friend request accepted',
            friendship: updated,
            autoAccepted: true
          });
        }
        return res.status(400).json({ error: 'Friend request already sent' });
      }
      // If previously rejected, allow re-sending by updating the existing record
      if (existingFriendship.senderId === userId) {
        const updated = await db.friendship.update({
          where: { id: existingFriendship.id },
          data: { status: 'PENDING', updatedAt: new Date() },
        });
        return res.json({
          message: 'Friend request sent',
          friendship: updated
        });
      }
    }

    // Create new friendship request
    const friendship = await db.friendship.create({
      data: {
        senderId: userId,
        receiverId: targetUser.id,
        status: 'PENDING',
      },
    });

    res.json({ message: 'Friend request sent', friendship });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/request/:id/accept', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const friendship: FriendshipRecord | null = await db.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request is no longer pending' });
    }

    const updated = await db.friendship.update({
      where: { id },
      data: { status: 'ACCEPTED' },
      include: {
        sender: { select: { id: true, username: true } },
      },
    });

    res.json({
      message: 'Friend request accepted',
      friendship: updated,
      friend: updated.sender
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject friend request
router.post('/request/:id/reject', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const friendship: FriendshipRecord | null = await db.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to reject this request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request is no longer pending' });
    }

    const updated = await db.friendship.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    res.json({ message: 'Friend request rejected', friendship: updated });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// Cancel sent friend request
router.delete('/request/:id', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const friendship: FriendshipRecord | null = await db.friendship.findUnique({
      where: { id },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.senderId !== userId) {
      return res.status(403).json({ error: 'Not authorized to cancel this request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Request is no longer pending' });
    }

    await db.friendship.delete({
      where: { id },
    });

    res.json({ message: 'Friend request cancelled' });
  } catch (error) {
    console.error('Error cancelling friend request:', error);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
});

// Unfriend
router.delete('/:friendId', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { friendId } = req.params;

    const friendship: FriendshipRecord | null = await db.friendship.findFirst({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
        status: 'ACCEPTED',
      },
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    await db.friendship.delete({
      where: { id: friendship.id },
    });

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Search users (for adding friends)
router.get('/search', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: q,
          mode: 'insensitive',
        },
        id: { not: userId },
      },
      select: {
        id: true,
        username: true,
        eloRating: true,
      },
      take: 10,
    });

    // Check friendship status for each user
    const friendships: FriendshipRecord[] = await db.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: { in: users.map((u: { id: string }) => u.id) } },
          { receiverId: userId, senderId: { in: users.map((u: { id: string }) => u.id) } },
        ],
      },
    });

    const usersWithStatus = users.map((user: { id: string; username: string; eloRating: number }) => {
      const friendship = friendships.find(
        (f) => f.senderId === user.id || f.receiverId === user.id
      );
      return {
        ...user,
        friendshipStatus: friendship?.status || null,
        isPending: friendship?.status === 'PENDING',
        isFriend: friendship?.status === 'ACCEPTED',
      };
    });

    res.json({ users: usersWithStatus });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

export default router;
