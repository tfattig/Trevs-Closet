const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { hasPermission } = require('../utils');

const Mutations = {
    async createItem(parent, args, ctx, info) {
        if (!ctx.request.userId) {
          throw new Error('You must be logged in to do that!');
        }
    
        const item = await ctx.db.mutation.createItem(
          {
            data: {
              // This is how to create a relationship between the Item and the User
              user: {
                connect: {
                  id: ctx.request.userId,
                },
              },
              ...args,
            },
          },
          info
        );
    
        console.log(item);
    
        return item;
      },
    updateItem(parent,args,ctx,info){
        //first take a copy of updates
        const updates = { ...args };
        //remove the ID from the updates
        delete updates.id;
        //run the update method
        return ctx.db.mutation.updateItem({
            data: updates,
            where: {
                id: args.id,
            },
        }, info
        );
    },
    async deleteItem(parent, args, ctx, info){
        const where = { id: args.id };
        //1. find the item
        const item = await ctx.db.query.item({ where }, `{
            id 
            title
            user { id }
        }`);
        //2. Check if they own the item, or if they have permissions
        const ownsItem = item.user.id === ctx.request.userId;
        const hasPermissions = ctx.request.user.permissions.some(permission => ['ADMIN', 'ITEMDELETE'].includes(permission));
        if(!ownsItem && !hasPermissions){
            throw new Error("You do not have permission to do that");
        }
        //TODO
        //3. Delete it.
        return ctx.db.mutation.deleteItem({ where }, info);
    },
    async signup(parent, args, ctx, info) {
        args.email = args.email.toLowerCase();
        //hash their password
        const password = await bcrypt.hash(args.password, 10);
        //create the user in the database
        const user = await ctx.db.mutation.createUser(
            {
                data: {
                    ...args,
                    password,
                    permissions: { set: ['USER'] }
                }
        }, info);
        //create JWT token
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        //We set the jwt as a cookie on the response
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
        });
        //finally return user to browser
        return user;
    },
    async signin(parent, { email, password }, ctx, info){
        //check if there is a user with that email
        const user = await ctx.db.query.user({ where: { email } });
        if(!user){
            throw new Error(`No such user found for email ${email}`);
        }
        //check if the password is correct
        const valid = await bcrypt.compare(password, user.password);
        if(!valid) {
            throw Error('Invalid Password!');
        }
        //generate jwt token
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        //set cookie with token
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365
        });
        //return the user
        return user;
    },
    signout(parent, args, ctx, info){
        ctx.response.clearCookie('token');
        return { message: 'Goodbye!' };
    },
    async requestReset(parent, args, ctx, info){
        //check if this is a real user
        const user = await ctx.db.query.user({ where: {email: args.email} });
        if(!user){
            throw new Error(`No such user forund for email ${args.email}`);
        }
        //set a reset token and expiry on that user
        const randomBytesPromiseified = promisify(randomBytes);
        const resetToken = (await randomBytesPromiseified(20)).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; //1 hour from now
        const res = await ctx.db.mutation.updateUser({
            where: { email: args.email },
            data: { resetToken, resetTokenExpiry }
        });
        //email them that reset token
        const mailRes = await transport.sendMail({
            from: 'tdawg@tdawg.com',
            to: user.email,
            subject: 'Your Password Reset Token',
            html: makeANiceEmail(`Your Password Reset Token is Here! 
            \n\n 
            <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a> `)
        });
        //return the message
        return { message: 'Thanks!' };
    },
    async resetPassword(parent, args, ctx, info) {
        //check is the passwords match
        if(args.password !== args.confirmPassword) {
            throw new Error(`Passwords don't match`);
        }
        //check if it's a legit reset token
        //check if it's expired
        const [user] = await ctx.db.query.users({
            where: {
                resetToken: args.resetToken,
                resetTokenExpiry_gte: Date.now() - 3600000,
            }
        });
        if(!user) {
            throw new Error('This token is either invalid or expired!');
        }
        //hash the new password
        const password = await bcrypt.hash(args.password, 10);
        //save the new password to the user and remove old reset token fields
        const updatedUser = await ctx.db.mutation.updateUser({
            where: { email: user.email },
            data: {
                password,
                resetToken: null,
                resetTokenExpiry: null
            }
        });
        //Generate JWT
        const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
        //set the JWT cookie
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365
        })
        //return the new user
        return updatedUser;
    },
    async updatePermissions(parent, args, ctx, info) {
        //check if they are logged in
        if(!ctx.request.userId) {
            throw new Error('You must be logged in!');
        }
        //Query the current user
        const currentUser = await ctx.db.query.user({
            where: {
                id: ctx.request.userId,
            },
        },
        info
    );
        //check if they have permission to do this
        hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);
        //Update the permissions
        return ctx.db.mutation.updateUser({
            data: {
                permissions: {
                    set: args.permissions
                },
            },
            where: {
                id: args.userId
            }
        }, info);
    },
    async addToCart(parent, args, ctx, info) {
      // 1. Make sure they are signed in
      const { userId } = ctx.request;
      if (!userId) {
        throw new Error('You must be signed in soooon');
      }
      // 2. Query the users current cart
      const [existingCartItem] = await ctx.db.query.cartItems({
        where: {
          user: { id: userId },
          item: { id: args.id },
        },
      });
      // 3. Check if that item is already in their cart and increment by 1 if it is
      if (existingCartItem) {
        console.log('This item is already in their cart');
        return ctx.db.mutation.updateCartItem(
          {
            where: { id: existingCartItem.id },
            data: { quantity: existingCartItem.quantity + 1 },
          },
          info
        );
      }
      // 4. If its not, create a fresh CartItem for that user!
      return ctx.db.mutation.createCartItem(
        {
          data: {
            user: {
              connect: { id: userId },
            },
            item: {
              connect: { id: args.id },
            },
          },
        },
        info
      );
      },
    };

module.exports = Mutations;
